import assert from 'node:assert/strict';
import test from 'node:test';

import { buildExportPayload, sanitizeImportData } from '../js/data-transfer.js';
import { state } from '../js/state.js';

test('sanitizeImportData keeps the same accepted record shapes', () => {
  const result = sanitizeImportData({
    brands: [{ id: 'brand_1', name: 'Technogym' }, { id: '', name: 'Invalid' }],
    machines: [{ id: 'machine_1', brandId: 'brand_1', name: 'Chest Press' }],
    sets: [
      { id: 'set_1', machineId: 'machine_1', loggedAt: '2026-07-20T12:00:00.000Z', weight: '100', reps: '8' },
      { id: 'set_2', machineId: 'machine_1', loggedAt: '', weight: '100', reps: '8' },
    ],
    bodyweights: [{ id: 'bodyweight_1', loggedAt: '2026-07-20T12:00:00.000Z', weight: '80.5' }],
  });

  assert.equal(result.brands.length, 1);
  assert.equal(result.machines.length, 1);
  assert.equal(result.sets.length, 1);
  assert.equal(result.bodyweights.length, 1);
});

test('buildExportPayload clones all locally stored collections', () => {
  state.brands = [{ id: 'brand_1', name: 'Technogym' }];
  state.machines = [];
  state.sets = [];
  state.bodyweights = [];

  const payload = buildExportPayload();
  assert.equal(payload.version, 1);
  assert.deepEqual(payload.brands, state.brands);
  assert.notEqual(payload.brands, state.brands);
  assert.ok(Number.isFinite(new Date(payload.exportedAt).getTime()));
});
