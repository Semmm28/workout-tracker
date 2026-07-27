import assert from 'node:assert/strict';
import test from 'node:test';

import {
  chartSeries,
  compareSetsChronologically,
  e1rmPrSetIds,
  groupedRecentActivity,
  groupedSets,
} from '../js/selectors.js';
import { state } from '../js/state.js';

function loadFixture() {
  state.brands = [{ id: 'brand_1', name: 'Technogym', sortOrder: 0 }];
  state.machines = [{ id: 'machine_1', brandId: 'brand_1', name: 'Chest Press', sortOrder: 0 }];
  state.sets = [
    { id: 'set_1', machineId: 'machine_1', loggedAt: '2026-07-20T10:00:00.000Z', weight: '100', reps: '8' },
    { id: 'set_2', machineId: 'machine_1', loggedAt: '2026-07-20T10:05:00.000Z', weight: '90', reps: '10' },
    { id: 'set_3', machineId: 'machine_1', loggedAt: '2026-07-21T10:00:00.000Z', weight: '102.5', reps: '8' },
  ];
  state.recentActivityExpanded = { '2026-07-20': true };
  state.preferences.chartSeriesMode = 'e1rmMax';
}

test('groupedSets groups and orders workout days without database access', () => {
  loadFixture();
  const groups = groupedSets('machine_1');
  assert.equal(groups.length, 2);
  assert.equal(groups[0].items[0].id, 'set_3');
  assert.deepEqual(groups[1].items.map((entry) => entry.id), ['set_1', 'set_2']);
});

test('chartSeries selects the heaviest daily e1RM', () => {
  loadFixture();
  const series = chartSeries('machine_1', 'e1rm');
  assert.equal(series.length, 2);
  assert.equal(series[0].id, 'set_1');
  assert.equal(series[1].id, 'set_3');
});

test('groupedRecentActivity links sets to their machine and brand', () => {
  loadFixture();
  const groups = groupedRecentActivity();
  const july20 = groups.find((group) => group.key === '2026-07-20');
  assert.equal(july20.expanded, true);
  assert.equal(july20.items[0].machine.name, 'Chest Press');
  assert.equal(july20.items[0].brand.name, 'Technogym');
});

test('e1rm PRs are chronological and require a strictly higher result', () => {
  loadFixture();
  state.sets = [
    { id: 'set_d', machineId: 'machine_1', loggedAt: '2026-07-04T10:00:00.000Z', weight: '100', reps: '6' },
    { id: 'set_c', machineId: 'machine_1', loggedAt: '2026-07-03T10:00:00.000Z', weight: '90', reps: '9' },
    { id: 'set_a', machineId: 'machine_1', loggedAt: '2026-07-01T10:00:00.000Z', weight: '100', reps: '5' },
    { id: 'set_b', machineId: 'machine_1', loggedAt: '2026-07-02T10:00:00.000Z', weight: '90', reps: '9' },
  ];

  assert.deepEqual([...e1rmPrSetIds('machine_1')], ['set_a', 'set_b', 'set_d']);
});

test('mathematically equal e1RMs are not split by floating-point noise', () => {
  loadFixture();
  state.sets = [
    { id: 'exact', machineId: 'machine_1', loggedAt: '2026-07-01T10:00:00.000Z', weight: '52.5', reps: '4' },
    { id: 'float-noise', machineId: 'machine_1', loggedAt: '2026-07-02T10:00:00.000Z', weight: '51', reps: '5' },
  ];

  assert.equal(52.5 * (1 + 4 / 30), 59.5);
  assert.equal(51 * (1 + 5 / 30), 59.50000000000001);
  assert.deepEqual([...e1rmPrSetIds('machine_1')], ['exact']);
});

test('e1rm PRs ignore invalid sets and stay isolated per machine', () => {
  loadFixture();
  state.sets = [
    { id: 'zero', machineId: 'machine_1', loggedAt: '2026-07-01T10:00:00.000Z', weight: '0', reps: '8' },
    { id: 'bad-date', machineId: 'machine_1', loggedAt: 'not-a-date', weight: '200', reps: '8' },
    { id: 'valid', machineId: 'machine_1', loggedAt: '2026-07-02T10:00:00.000Z', weight: '100', reps: '8' },
    { id: 'other-machine', machineId: 'machine_2', loggedAt: '2026-07-01T10:00:00.000Z', weight: '300', reps: '8' },
  ];

  assert.deepEqual([...e1rmPrSetIds('machine_1')], ['valid']);
});

test('equal timestamps use createdAt and then id for deterministic chronology', () => {
  const early = {
    id: 'set_z',
    loggedAt: '2026-07-01T10:00:00.000Z',
    createdAt: '2026-07-01T10:01:00.000Z',
  };
  const late = {
    id: 'set_a',
    loggedAt: '2026-07-01T10:00:00.000Z',
    createdAt: '2026-07-01T10:02:00.000Z',
  };
  assert.equal(compareSetsChronologically(early, late) < 0, true);

  const withoutCreatedAtA = { id: 'set_a', loggedAt: early.loggedAt };
  const withoutCreatedAtZ = { id: 'set_z', loggedAt: early.loggedAt };
  assert.equal(compareSetsChronologically(withoutCreatedAtA, withoutCreatedAtZ) < 0, true);

  const nullCreatedAt = { id: 'set_z', loggedAt: early.loggedAt, createdAt: null };
  assert.equal(compareSetsChronologically(withoutCreatedAtA, nullCreatedAt) < 0, true);
});

test('e1rm PRs recalculate after backdated inserts, edits, and deletes', () => {
  loadFixture();
  const first = {
    id: 'first',
    machineId: 'machine_1',
    loggedAt: '2026-07-01T10:00:00.000Z',
    weight: '100',
    reps: '5',
  };
  const last = {
    id: 'last',
    machineId: 'machine_1',
    loggedAt: '2026-07-03T10:00:00.000Z',
    weight: '105',
    reps: '5',
  };
  state.sets = [last, first];
  assert.deepEqual([...e1rmPrSetIds('machine_1')], ['first', 'last']);

  const backdated = {
    id: 'backdated',
    machineId: 'machine_1',
    loggedAt: '2026-07-02T10:00:00.000Z',
    weight: '120',
    reps: '1',
  };
  state.sets.push(backdated);
  assert.deepEqual([...e1rmPrSetIds('machine_1')], ['first', 'backdated']);

  state.sets = state.sets.filter((entry) => entry.id !== 'backdated');
  assert.deepEqual([...e1rmPrSetIds('machine_1')], ['first', 'last']);

  last.weight = '90';
  assert.deepEqual([...e1rmPrSetIds('machine_1')], ['first']);
});
