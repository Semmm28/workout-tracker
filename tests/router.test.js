import assert from 'node:assert/strict';
import test from 'node:test';

import { deriveRouteFromHash, navigationDepth, parentRoute, routeToHash, writeRoute } from '../js/router.js';

test('routeToHash maps every screen to the existing URL format', () => {
  assert.equal(routeToHash({ screen: 'brands' }), '#/brands');
  assert.equal(routeToHash({ screen: 'machines', brandId: 'brand_1' }), '#/brands/brand_1');
  assert.equal(
    routeToHash({ screen: 'machineDetail', brandId: 'brand_1', machineId: 'machine_1' }),
    '#/brands/brand_1/machines/machine_1',
  );
  assert.equal(routeToHash({ screen: 'recentActivity' }), '#/recent-activity');
  assert.equal(routeToHash({ screen: 'bodyweight' }), '#/bodyweight');
  assert.equal(routeToHash({ screen: 'settings' }), '#/settings');
});

test('deriveRouteFromHash restores routes and rejects unknown hashes', () => {
  assert.deepEqual(deriveRouteFromHash('#/brands'), { screen: 'brands', brandId: null, machineId: null });
  assert.deepEqual(deriveRouteFromHash('#/brands/brand_1'), {
    screen: 'machines',
    brandId: 'brand_1',
    machineId: null,
  });
  assert.deepEqual(deriveRouteFromHash('#/brands/brand_1/machines/machine_1'), {
    screen: 'machineDetail',
    brandId: 'brand_1',
    machineId: 'machine_1',
  });
  assert.deepEqual(deriveRouteFromHash('#/unknown'), { screen: 'brands', brandId: null, machineId: null });
});

test('app history has a safe boundary and does not duplicate the current page', (t) => {
  const entries = [null];
  const location = new URL('https://workout.example/');
  const history = {
    state: null,
    replaceState(state, title, url) {
      this.state = state;
      location.href = url.href;
      entries[entries.length - 1] = state;
    },
    pushState(state, title, url) {
      this.state = state;
      location.href = url.href;
      entries.push(state);
    },
  };
  const oldLocation = globalThis.location;
  const oldHistory = globalThis.history;
  globalThis.location = location;
  globalThis.history = history;
  t.after(() => {
    if (oldLocation === undefined) delete globalThis.location;
    else globalThis.location = oldLocation;
    if (oldHistory === undefined) delete globalThis.history;
    else globalThis.history = oldHistory;
  });
  assert.equal(navigationDepth(), 0);
  writeRoute({ screen: 'brands' }, true);
  assert.equal(navigationDepth(), 0);
  writeRoute({ screen: 'recentActivity' });
  writeRoute({ screen: 'recentActivity' });
  assert.equal(navigationDepth(), 1);
  assert.equal(entries.length, 2);
  writeRoute({ screen: 'machineDetail', brandId: 'brand_1', machineId: 'machine_1' });
  assert.equal(navigationDepth(), 2);
  history.state = entries.at(-2);
  assert.equal(history.state.screen, 'recentActivity');
  assert.equal(navigationDepth(), 1);
  history.state = entries[0];
  assert.equal(navigationDepth(), 0);
});

test('deep links have a safe parent fallback and the home page has none', () => {
  assert.equal(parentRoute({ screen: 'brands' }), null);
  assert.deepEqual(parentRoute({ screen: 'machineDetail', brandId: 'brand_1', machineId: 'machine_1' }), {
    screen: 'machines', brandId: 'brand_1', machineId: null,
  });
  assert.deepEqual(parentRoute({ screen: 'machines', brandId: 'brand_1' }), {
    screen: 'brands', brandId: null, machineId: null,
  });
});
