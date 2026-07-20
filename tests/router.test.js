import assert from 'node:assert/strict';
import test from 'node:test';

import { deriveRouteFromHash, routeToHash } from '../js/router.js';

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
