export function routeToHash(route) {
  if (route.screen === 'brands') return '#/brands';
  if (route.screen === 'machines') return `#/brands/${route.brandId}`;
  if (route.screen === 'machineDetail') return `#/brands/${route.brandId}/machines/${route.machineId}`;
  if (route.screen === 'recentActivity') return '#/recent-activity';
  if (route.screen === 'bodyweight') return '#/bodyweight';
  if (route.screen === 'settings') return '#/settings';
  return '#/brands';
}

export function deriveRouteFromHash(hash = location.hash) {
  const value = hash.replace(/^#\/?/, '');
  if (!value || value === 'brands') return { screen: 'brands', brandId: null, machineId: null };
  if (value === 'recent-activity') return { screen: 'recentActivity', brandId: null, machineId: null };
  if (value === 'bodyweight') return { screen: 'bodyweight', brandId: null, machineId: null };
  if (value === 'settings') return { screen: 'settings', brandId: null, machineId: null };
  const parts = value.split('/');
  if (parts[0] === 'brands' && parts[1] && !parts[2]) {
    return { screen: 'machines', brandId: parts[1], machineId: null };
  }
  if (parts[0] === 'brands' && parts[1] && parts[2] === 'machines' && parts[3]) {
    return { screen: 'machineDetail', brandId: parts[1], machineId: parts[3] };
  }
  return { screen: 'brands', brandId: null, machineId: null };
}

export function navigationDepth() {
  const depth = history.state?.workoutNavigationDepth;
  return Number.isSafeInteger(depth) && depth >= 0 ? depth : 0;
}

export function parentRoute(route) {
  if (route.screen === 'brands') return null;
  if (route.screen === 'machineDetail') {
    return { screen: 'machines', brandId: route.brandId, machineId: null };
  }
  return { screen: 'brands', brandId: null, machineId: null };
}

export function writeRoute(route, replace = false) {
  const url = new URL(location.href);
  url.hash = routeToHash(route);
  const replaceEntry = replace || url.hash === location.hash;
  const entry = { ...route, workoutNavigationDepth: navigationDepth() + (replaceEntry ? 0 : 1) };
  if (replaceEntry) history.replaceState(entry, '', url);
  else history.pushState(entry, '', url);
}
