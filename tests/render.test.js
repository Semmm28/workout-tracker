import assert from 'node:assert/strict';
import test from 'node:test';

import { renderAppMarkup } from '../js/render.js';
import { state } from '../js/state.js';

function loadFixture() {
  state.ready = true;
  state.brands = [{ id: 'brand_1', name: 'Technogym', sortOrder: 0 }];
  state.machines = [{ id: 'machine_1', brandId: 'brand_1', name: 'Chest Press', note: '', sortOrder: 0 }];
  state.sets = [{
    id: 'set_1',
    machineId: 'machine_1',
    loggedAt: '2026-07-20T10:00:00.000Z',
    weight: '100',
    reps: '8',
    notes: '',
  }];
  state.bodyweights = [{ id: 'bodyweight_1', loggedAt: '2026-07-20T12:00:00.000Z', weight: '80.5' }];
  state.search = { brands: '', machines: '' };
  state.reorder = { brands: false, machines: false };
  state.recentActivityExpanded = { '2026-07-20': true };
  state.modal = null;
  state.confirmSheet = null;
  state.toast = null;
  state.menuOpen = false;
  state.preferences.chartSeriesMode = 'e1rmMax';
}

test('all routes render their existing screen content', () => {
  loadFixture();
  const expectations = [
    [{ screen: 'brands', brandId: null, machineId: null }, 'Technogym'],
    [{ screen: 'machines', brandId: 'brand_1', machineId: null }, 'Chest Press'],
    [{ screen: 'machineDetail', brandId: 'brand_1', machineId: 'machine_1' }, '100 kg'],
    [{ screen: 'recentActivity', brandId: null, machineId: null }, 'Recente activiteit'],
    [{ screen: 'bodyweight', brandId: null, machineId: null }, '80.5 kg'],
    [{ screen: 'settings', brandId: null, machineId: null }, 'Data exporteren'],
  ];

  expectations.forEach(([route, text]) => {
    state.route = route;
    assert.match(renderAppMarkup(), new RegExp(text));
  });
});

test('set modal has close and save actions in its top header', () => {
  loadFixture();
  state.route = { screen: 'machineDetail', brandId: 'brand_1', machineId: 'machine_1' };
  state.modal = { type: 'set', mode: 'add', data: null };

  const markup = renderAppMarkup();
  const header = markup.match(/<div class="modal-header set-modal-header">([\s\S]*?)<\/div>/)?.[1] || '';
  const form = markup.match(/<form class="modal-body" id="set-form">([\s\S]*?)<\/form>/)?.[1] || '';

  assert.match(header, /data-action="close-modal"/);
  assert.match(header, /<h2>Add Set<\/h2>/);
  assert.match(header, /type="submit"[^>]*form="set-form"[^>]*>Save set<\/button>/);
  assert.doesNotMatch(form, /modal-footer/);
});
