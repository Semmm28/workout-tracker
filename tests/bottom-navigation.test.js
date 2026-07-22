import test from 'node:test';
import assert from 'node:assert/strict';

import {
  renderBottomNavigation,
  renderHeader,
  renderModal,
} from '../js/ui/components.js';
import { state } from '../js/state.js';

test('bottom navigation uses the requested order and no hamburger button', () => {
  state.route = { screen: 'brands', brandId: null, machineId: null };
  const markup = renderBottomNavigation();
  const labels = ['Workouts', 'Recent', 'Log set', 'Lichaamsgewicht', 'Instellingen'];

  labels.reduce((previousIndex, label) => {
    const index = markup.indexOf(label);
    assert.ok(index > previousIndex, `${label} should follow the previous tab`);
    return index;
  }, -1);

  assert.match(markup, /data-action="quick-log-set"/);
  assert.match(markup, /data-action="nav-workouts"[\s\S]*aria-current="page"/);
  assert.doesNotMatch(renderHeader({ title: 'Workouts' }), /toggle-menu/);
});

test('active state follows all top-level tabs', () => {
  const routes = [
    ['recentActivity', 'nav-recent-activity'],
    ['bodyweight', 'nav-bodyweight'],
    ['settings', 'nav-settings'],
  ];

  for (const [screen, action] of routes) {
    state.route = { screen, brandId: null, machineId: null };
    const markup = renderBottomNavigation();
    const button = markup.match(new RegExp(`<button[\\s\\S]*?data-action="${action}"[\\s\\S]*?</button>`))?.[0] || '';
    assert.match(button, /aria-current="page"/);
  }
});

test('quick-log picker lists machines with their brands', () => {
  state.brands = [{ id: 'brand-1', name: 'Technogym' }];
  state.machines = [{ id: 'machine-1', brandId: 'brand-1', name: 'Chest Press' }];
  state.modal = { type: 'set-picker' };

  const markup = renderModal();
  assert.match(markup, /Set loggen/);
  assert.match(markup, /Chest Press/);
  assert.match(markup, /Technogym/);
  assert.match(markup, /data-action="quick-log-machine"/);

  state.modal = null;
});
