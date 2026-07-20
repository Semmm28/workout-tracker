import assert from 'node:assert/strict';
import test from 'node:test';

import { chartSeries, groupedRecentActivity, groupedSets } from '../js/selectors.js';
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
