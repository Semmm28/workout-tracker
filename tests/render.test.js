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

test('set modal keeps native date and time input semantics', () => {
  loadFixture();
  state.route = { screen: 'machineDetail', brandId: 'brand_1', machineId: 'machine_1' };
  state.modal = { type: 'set', mode: 'add', data: null };

  const markup = renderAppMarkup();
  const form = markup.match(/<form class="modal-body" id="set-form">([\s\S]*?)<\/form>/)?.[1] || '';

  assert.match(form, /<input id="set-date" name="date" type="date" value="[^"]*" \/>/);
  assert.match(form, /<input id="set-time" name="time" type="time" value="[^"]*" \/>/);
});

test('set modal restores optional RPE without making it required', () => {
  loadFixture();
  state.route = { screen: 'machineDetail', brandId: 'brand_1', machineId: 'machine_1' };
  state.modal = {
    type: 'set',
    mode: 'edit',
    data: { ...state.sets[0], rpe: '8.5' },
  };

  const markup = renderAppMarkup();
  const rpeInput = markup.match(/<input\s+id="set-rpe"[\s\S]*?\/>/)?.[0] || '';

  assert.match(markup, /<label for="set-rpe">RPE<\/label>/);
  assert.match(rpeInput, /name="rpe"/);
  assert.match(rpeInput, /type="number"/);
  assert.match(rpeInput, /step="0.5"/);
  assert.match(rpeInput, /min="1"/);
  assert.match(rpeInput, /max="10"/);
  assert.match(rpeInput, /value="8.5"/);
  assert.doesNotMatch(rpeInput, /\brequired\b/);
});

test('set rows expose the same accessible edit and delete menu for click and swipe', () => {
  loadFixture();
  state.route = { screen: 'machineDetail', brandId: 'brand_1', machineId: 'machine_1' };

  const markup = renderAppMarkup();
  assert.match(markup, /class="swipe-track" data-swipe-toggle="set" role="button" tabindex="0" aria-expanded="false"/);
  assert.match(markup, /aria-label="Set 1, 100 kilograms, 8 repetitions, e1RM 126\.7 kilograms; show edit and delete actions"/);
  assert.match(markup, /class="swipe-actions"[^>]*aria-hidden="true" inert/);
  assert.match(markup, /data-action="edit-set"[^>]*tabindex="-1"/);
  assert.match(markup, /data-action="delete-set"[^>]*tabindex="-1"/);
});

test('machine history renders chronological e1RM trophies and optional RPE', () => {
  loadFixture();
  state.route = { screen: 'machineDetail', brandId: 'brand_1', machineId: 'machine_1' };
  state.sets = [
    { id: 'set_4', machineId: 'machine_1', loggedAt: '2026-07-04T10:00:00.000Z', weight: '100', reps: '6', rpe: '8.5' },
    { id: 'set_3', machineId: 'machine_1', loggedAt: '2026-07-03T10:00:00.000Z', weight: '90', reps: '9' },
    { id: 'set_2', machineId: 'machine_1', loggedAt: '2026-07-02T10:00:00.000Z', weight: '90', reps: '9' },
    { id: 'set_1', machineId: 'machine_1', loggedAt: '2026-07-01T10:00:00.000Z', weight: '100', reps: '5' },
  ];

  const markup = renderAppMarkup();
  assert.equal((markup.match(/class="set-pr-slot"/g) || []).length, 4);
  assert.equal((markup.match(/class="set-pr-trophy"/g) || []).length, 3);
  assert.match(markup, /aria-label="e1RM personal record">🏆/);
  assert.match(markup, /class="tag-chip">RPE 8\.5<\/div>/);

  const setLabelIndex = markup.indexOf('class="set-name">Set 1');
  const trophySlotIndex = markup.indexOf('class="set-pr-slot"', setLabelIndex);
  const weightIndex = markup.indexOf('>Weight<', trophySlotIndex);
  assert.ok(setLabelIndex < trophySlotIndex && trophySlotIndex < weightIndex);
});
