import { createController } from './js/controller.js';
import { loadState } from './js/data.js';
import { openDb } from './js/database.js';
import {
  refreshApp,
  registerServiceWorker,
  setupServiceWorkerAutoRefresh,
  setupVisualViewportTracking,
} from './js/pwa.js';
import { renderAppMarkup, renderLoadingMarkup } from './js/render.js';
import { deriveRouteFromHash, writeRoute } from './js/router.js';
import { state } from './js/state.js';
import { closeSwipeRows } from './js/ui/gestures.js';

const app = document.getElementById('app');

let controller;

function render() {
  if (!state.ready) {
    app.innerHTML = renderLoadingMarkup();
    return;
  }

  app.innerHTML = renderAppMarkup();
  controller.wireRenderedUi();
}

function navigate(route, replace = false) {
  state.route = route;
  state.menuOpen = false;
  writeRoute(route, replace);
  closeSwipeRows();
  render();
}

controller = createController({
  render,
  navigate,
  refreshApp: () => refreshApp(controller.showToast),
});

async function init() {
  controller.attachEventDelegation();
  setupServiceWorkerAutoRefresh();
  setupVisualViewportTracking();
  window.addEventListener('popstate', () => {
    state.route = deriveRouteFromHash();
    render();
  });

  await openDb();
  await loadState();
  state.route = deriveRouteFromHash();
  state.ready = true;
  if (!location.hash) navigate({ screen: 'brands', brandId: null, machineId: null }, true);
  render();
  registerServiceWorker();
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
