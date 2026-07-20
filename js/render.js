import { renderBodyweightScreen } from './screens/bodyweight.js';
import { renderRecentActivityScreen } from './screens/recent-activity.js';
import { renderSettingsScreen } from './screens/settings.js';
import {
  renderBrandsScreen,
  renderMachineDetailScreen,
  renderMachinesScreen,
} from './screens/workouts.js';
import { state } from './state.js';
import {
  renderConfirmSheet,
  renderMenu,
  renderModal,
  renderToast,
} from './ui/components.js';

export function renderLoadingMarkup() {
  return `
    <div class="loading-screen">
      <div class="loading-logo">WL</div>
      <h1>Workout Log</h1>
      <p>Preparing your offline workout tracker…</p>
    </div>
  `;
}

export function renderAppMarkup() {
  let screen = '';
  if (state.route.screen === 'brands') screen = renderBrandsScreen();
  if (state.route.screen === 'machines') screen = renderMachinesScreen();
  if (state.route.screen === 'machineDetail') screen = renderMachineDetailScreen();
  if (state.route.screen === 'recentActivity') screen = renderRecentActivityScreen();
  if (state.route.screen === 'bodyweight') screen = renderBodyweightScreen();
  if (state.route.screen === 'settings') screen = renderSettingsScreen();

  return `
    <main class="app">
      <div class="phone-frame">${screen}</div>
      ${renderMenu()}
      ${renderModal()}
      ${renderConfirmSheet()}
      ${renderToast()}
    </main>
  `;
}
