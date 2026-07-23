import assert from 'node:assert/strict';
import test from 'node:test';

import { icon } from '../js/constants.js';
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

test('set modal has accessible icon-only save actions at the top and bottom', () => {
  loadFixture();
  state.route = { screen: 'machineDetail', brandId: 'brand_1', machineId: 'machine_1' };
  state.modal = { type: 'set', mode: 'add', data: null };

  const markup = renderAppMarkup();
  assert.match(markup, /class="modal-backdrop set-modal-backdrop fade-in"/);
  const header = markup.match(/<div class="modal-header set-modal-header">([\s\S]*?)<\/div>/)?.[1] || '';
  const form = markup.match(/<form class="modal-body" id="set-form">([\s\S]*?)<\/form>/)?.[1] || '';

  assert.match(header, /data-action="close-modal"/);
  assert.match(header, /<h2>Add Set<\/h2>/);
  assert.match(header, /type="submit"[^>]*class="[^"]*set-modal-save-top[^"]*"[^>]*form="set-form"[^>]*data-set-submit[^>]*aria-label="Save set"[^>]*title="Save set"[^>]*>[\s\S]*?class="save-icon"[^>]*aria-hidden="true"/);
  assert.match(form, /type="submit"[^>]*class="[^"]*set-modal-save-bottom[^"]*"[^>]*form="set-form"[^>]*data-set-submit[^>]*aria-label="Save set"[^>]*title="Save set"[^>]*>[\s\S]*?class="save-icon"[^>]*aria-hidden="true"/);
  assert.equal((markup.match(/data-set-submit/g) || []).length, 2);
  assert.equal((markup.match(/aria-label="Save set"/g) || []).length, 2);
  assert.equal((markup.match(/id="set-form"/g) || []).length, 1);
  assert.doesNotMatch(header, />\s*Save set\s*<\/button>/);
  assert.doesNotMatch(form, />\s*Save set\s*<\/button>/);
  assert.doesNotMatch(form, /class="modal-footer"/);
});

test('set modal save actions fall back to SVG instead of rendering undefined', () => {
  loadFixture();
  state.route = { screen: 'machineDetail', brandId: 'brand_1', machineId: 'machine_1' };
  state.modal = { type: 'set', mode: 'add', data: null };

  const currentSaveIcon = icon.save;
  icon.save = undefined;

  try {
    const markup = renderAppMarkup();
    assert.doesNotMatch(markup, />\s*undefined\s*<\/button>/);
    assert.equal((markup.match(/class="save-icon"/g) || []).length, 2);
  } finally {
    icon.save = currentSaveIcon;
  }
});
