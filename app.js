import { createController } from './js/controller.js';
import { loadState } from './js/data.js';
import { openDb } from './js/database.js';
import { initializeCloudSync } from './js/cloud-sync.js';
import { initializeWatchSync, scheduleWatchSync } from './js/watch-sync.js';
import {
  refreshApp,
  registerServiceWorker,
  setupServiceWorkerAutoRefresh,
  setupVisualViewportTracking,
} from './js/pwa.js';
import { renderAppMarkup, renderLoadingMarkup } from './js/render.js';
import { deriveRouteFromHash, navigationDepth, parentRoute, routeToHash, writeRoute } from './js/router.js';
import { state } from './js/state.js';
import { closeSwipeRows } from './js/ui/gestures.js';
import { setupEdgeBackGesture } from './js/ui/edge-back.js';
import { createNavigationTransition } from './js/ui/navigation-transition.js';

const app = document.getElementById('app');
const transition = createNavigationTransition(app);
let lastDepth = navigationDepth();

let controller;

function render() {
  if (!state.ready) {
    app.innerHTML = renderLoadingMarkup();
    return;
  }

  app.innerHTML = renderAppMarkup();
  controller.wireRenderedUi();
}

function navigate(route, replace = false, direction = 'forward') {
  const changed = routeToHash(route) !== routeToHash(state.route);
  state.route = route;
  state.menuOpen = false;
  writeRoute(route, replace);
  lastDepth = navigationDepth();
  closeSwipeRows();
  transition(render, changed ? direction : null);
}

function canGoBack() {
  return state.ready && Boolean(state.confirmSheet || state.modal || state.menuOpen || navigationDepth() || parentRoute(state.route));
}

function goBack() {
  if (state.confirmSheet) state.confirmSheet = null;
  else if (state.modal) state.modal = null;
  else if (state.menuOpen) state.menuOpen = false;
  else {
    if (navigationDepth() > 0) {
      history.back();
      return;
    }
    const parent = parentRoute(state.route);
    if (parent) navigate(parent, true, 'back');
    return;
  }
  closeSwipeRows();
  render();
}

controller = createController({
  render,
  navigate,
  goBack,
  refreshApp: () => refreshApp(controller.showToast),
});

async function init() {
  controller.attachEventDelegation();
  setupServiceWorkerAutoRefresh();
  setupVisualViewportTracking();
  setupEdgeBackGesture({ canGoBack, goBack });
  window.addEventListener('popstate', () => {
    const direction = navigationDepth() > lastDepth ? 'forward' : 'back';
    lastDepth = navigationDepth();
    state.route = deriveRouteFromHash();
    state.modal = null;
    state.confirmSheet = null;
    state.menuOpen = false;
    closeSwipeRows();
    transition(render, direction);
  });

  await openDb();
  await loadState();
  state.route = deriveRouteFromHash();
  state.ready = true;
  writeRoute(state.route, true);
  lastDepth = navigationDepth();
  render();
  registerServiceWorker();
  void initializeWatchSync(async () => {
    await loadState();
    if (!state.modal && !state.confirmSheet) render();
  });
  void initializeCloudSync(async (dataChanged) => {
    if (dataChanged) await loadState();
    if (dataChanged) scheduleWatchSync();
    // Never replace a form while the user is typing because sync completed.
    if (!state.modal && !state.confirmSheet && (dataChanged || state.route.screen === 'settings')) render();
  });
}

init().catch((error) => {
  console.error(error);
  app.innerHTML = `
    <div class="loading-screen">
      <div class="loading-logo">!</div>
      <h1>Something went wrong</h1>
      <p>Please reload the app. Your stored workout data will stay on this device.</p>
    </div>
  `;
});
