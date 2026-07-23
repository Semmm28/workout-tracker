import { ACTION_WIDTH, icon } from '../constants.js';
import { state } from '../state.js';
import {
  escapeAttr,
  safeText,
  toInputDate,
  toInputTime,
} from '../utils.js';

export function renderHeader({ title, subtitle = '', showBack = false, onBack = '', extraButtons = '' }) {
  return `
    <header class="header">
      <div class="header-left">
        ${showBack ? `<button class="round-btn" data-action="${onBack}" aria-label="Go back">${icon.back}</button>` : ''}
        <div>
          <h1 class="screen-title">${safeText(title)}</h1>
          ${subtitle ? `<div class="subhead">${safeText(subtitle)}</div>` : ''}
        </div>
      </div>
      <div class="header-right">${extraButtons}</div>
    </header>
  `;
}

const tabIcons = {
  workouts: `
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <path d="M4 9v6M7 7v10M17 7v10M20 9v6M7 12h10" />
    </svg>
  `,
  recent: `
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <path d="M12 7v5l3 2" />
      <path d="M5.6 5.6A9 9 0 1 1 3 12" />
      <path d="M3 5v5h5" />
    </svg>
  `,
  bodyweight: `
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <path d="M5 7.5A3.5 3.5 0 0 1 8.5 4h7A3.5 3.5 0 0 1 19 7.5V20H5V7.5Z" />
      <path d="M9 9a3 3 0 0 1 6 0" />
      <path d="m12 9 1.4-1.4" />
    </svg>
  `,
  settings: `
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <circle cx="12" cy="12" r="3" />
      <path d="M19.4 15a1.7 1.7 0 0 0 .3 1.9l.1.1-2.8 2.8-.1-.1a1.7 1.7 0 0 0-1.9-.3 1.7 1.7 0 0 0-1 1.6v.2h-4V21a1.7 1.7 0 0 0-1-1.6 1.7 1.7 0 0 0-1.9.3l-.1.1L4.2 17l.1-.1a1.7 1.7 0 0 0 .3-1.9A1.7 1.7 0 0 0 3 14H2.8v-4H3a1.7 1.7 0 0 0 1.6-1 1.7 1.7 0 0 0-.3-1.9L4.2 7 7 4.2l.1.1A1.7 1.7 0 0 0 9 4.6 1.7 1.7 0 0 0 10 3v-.2h4V3a1.7 1.7 0 0 0 1 1.6 1.7 1.7 0 0 0 1.9-.3l.1-.1L19.8 7l-.1.1a1.7 1.7 0 0 0-.3 1.9 1.7 1.7 0 0 0 1.6 1h.2v4H21a1.7 1.7 0 0 0-1.6 1Z" />
    </svg>
  `,
};

function renderTab({ action, label, iconName, active }) {
  return `
    <button
      class="tab-button ${active ? 'active' : ''}"
      data-action="${action}"
      ${active ? 'aria-current="page"' : ''}
    >
      <span class="tab-icon">${tabIcons[iconName]}</span>
      <span class="tab-label">${label}</span>
    </button>
  `;
}

export function renderBottomNavigation() {
  const workoutScreens = new Set(['brands', 'machines', 'machineDetail']);
  const screen = state.route.screen;

  return `
    <div class="bottom-nav-shell">
      <nav class="bottom-nav" aria-label="Hoofdnavigatie">
        ${renderTab({ action: 'nav-workouts', label: 'Workouts', iconName: 'workouts', active: workoutScreens.has(screen) })}
        ${renderTab({ action: 'nav-recent-activity', label: 'Recent', iconName: 'recent', active: screen === 'recentActivity' })}
        <button class="tab-button log-set-tab" data-action="quick-log-set" aria-label="Set loggen">
          <span class="log-set-icon" aria-hidden="true">${icon.plus}</span>
          <span class="tab-label">Log set</span>
        </button>
        ${renderTab({ action: 'nav-bodyweight', label: 'Lichaamsgewicht', iconName: 'bodyweight', active: screen === 'bodyweight' })}
        ${renderTab({ action: 'nav-settings', label: 'Instellingen', iconName: 'settings', active: screen === 'settings' })}
      </nav>
    </div>
  `;
}

export function buildChartSvg(series) {
  const width = 320;
  const height = 190;
  const padX = 18;
  const padTop = 18;
  const padBottom = 26;
  const chartHeight = height - padTop - padBottom;
  const min = Math.min(...series.map((point) => point.value));
  const max = Math.max(...series.map((point) => point.value));
  const range = max - min || Math.max(max, 1);
  const points = series.map((point, index) => {
    const x = series.length === 1 ? width / 2 : padX + ((width - padX * 2) * index) / (series.length - 1);
    const y = padTop + chartHeight - (((point.value - min) / range) * chartHeight);
    return { ...point, x, y };
  });
  const line = points.map((point) => `${point.x},${point.y}`).join(' ');
  const area = `${padX},${height - padBottom} ${line} ${points[points.length - 1].x},${height - padBottom}`;
  const yTicks = [0, 0.5, 1].map((step) => {
    const y = padTop + chartHeight - step * chartHeight;
    const value = min + step * range;
    return { y, label: Number.isInteger(value) ? value : value.toFixed(1) };
  });
  const xLabels = points.length <= 5
    ? points
    : [points[0], points[Math.floor((points.length - 1) / 2)], points[points.length - 1]];

  return `
    <svg class="chart-svg" viewBox="0 0 ${width} ${height}" role="img" aria-label="Progress chart">
      ${yTicks.map((tick) => `
        <line class="chart-grid-line" x1="${padX}" x2="${width - padX}" y1="${tick.y}" y2="${tick.y}" />
        <text class="chart-axis" x="0" y="${tick.y + 4}">${safeText(tick.label)}</text>
      `).join('')}
      <polygon class="chart-fill" points="${area}" />
      <polyline class="chart-path" points="${line}" />
      ${points.map((point) => `<circle class="chart-point" cx="${point.x}" cy="${point.y}" r="4.8"></circle>`).join('')}
      ${xLabels.map((point) => `<text class="chart-axis" text-anchor="middle" x="${point.x}" y="${height - 6}">${safeText(point.xLabel)}</text>`).join('')}
    </svg>
  `;
}

export function renderSwipeContainer(type, id, content, disabled) {
  if (disabled) return content;
  const actionWidth = type === 'bodyweight' ? ACTION_WIDTH / 2 : ACTION_WIDTH;
  const actions = type === 'bodyweight'
    ? `<button class="delete" data-action="delete-${type}" data-id="${id}">Delete</button>`
    : `
        <button class="edit" data-action="edit-${type}" data-id="${id}">Edit</button>
        <button class="delete" data-action="delete-${type}" data-id="${id}">Delete</button>
      `;
  return `
    <div class="swipe-row" data-swipe-type="${type}" data-id="${id}" data-action-width="${actionWidth}">
      <div class="swipe-actions">
        ${actions}
      </div>
      <div class="swipe-track">${content}</div>
    </div>
  `;
}

export function renderModal() {
  if (!state.modal) return '';
  const modal = state.modal;

  if (modal.type === 'set-picker') {
    return `
      <div class="modal-backdrop fade-in" data-action="backdrop-close">
        <section class="modal quick-log-modal slide-up" role="dialog" aria-modal="true" aria-label="Kies een apparaat">
          <div class="modal-header">
            <div>
              <h2>Set loggen</h2>
              <p class="meta-text">Kies het apparaat waarvoor je een set wilt toevoegen.</p>
            </div>
            <button class="round-btn" data-action="close-modal" aria-label="Sluiten">${icon.close}</button>
          </div>
          <div class="quick-log-list">
            ${state.machines.map((machine) => {
              const brand = state.brands.find((item) => item.id === machine.brandId);
              return `
                <button
                  class="quick-log-machine"
                  data-action="quick-log-machine"
                  data-id="${escapeAttr(machine.id)}"
                >
                  <span class="quick-log-machine-copy">
                    <strong>${safeText(machine.name)}</strong>
                    <span>${safeText(brand?.name || 'Onbekend merk')}</span>
                  </span>
                  <span class="chevron" aria-hidden="true">${icon.chevron}</span>
                </button>
              `;
            }).join('')}
          </div>
        </section>
      </div>
    `;
  }

  const isBrand = modal.type === 'brand';
  const isMachine = modal.type === 'machine';
  const title = `${modal.mode === 'edit' ? 'Edit' : 'Add'} ${isBrand ? 'Brand' : isMachine ? 'Machine' : 'Set'}`;

  if (isBrand || isMachine) {
    return `
      <div class="modal-backdrop fade-in" data-action="backdrop-close">
        <section class="modal slide-up" role="dialog" aria-modal="true" aria-label="${title}">
          <div class="modal-header">
            <h2>${title}</h2>
            <button class="round-btn" data-action="close-modal" aria-label="Close">${icon.close}</button>
          </div>
          <form class="modal-body" id="entity-form">
            <div class="form-grid">
              <div class="field-group">
                <label>${isBrand ? 'Brand name' : 'Machine name'} <span class="required-dot">•</span></label>
                <input name="name" maxlength="80" required placeholder="${isBrand ? 'Example: Technogym' : 'Example: Leg Press'}" value="${escapeAttr(modal.data?.name || '')}" />
              </div>
              ${isMachine ? `
                <div class="field-group">
                  <label>Machine note</label>
                  <textarea name="note" maxlength="180" placeholder="Optional note you want to see while logging sets">${safeText(modal.data?.note || '')}</textarea>
                </div>
              ` : ''}
            </div>
            <div class="modal-footer">
              <button type="button" class="secondary-btn" data-action="close-modal">Cancel</button>
              <button type="submit" class="primary-btn">Save</button>
            </div>
          </form>
        </section>
      </div>
    `;
  }

  const entry = modal.data || {};
  return `
    <div class="modal-backdrop fade-in" data-action="backdrop-close">
      <section class="modal set-modal slide-up" role="dialog" aria-modal="true" aria-label="${title}">
        <div class="modal-header set-modal-header">
          <button class="round-btn" data-action="close-modal" aria-label="Close">${icon.close}</button>
          <h2>${title}</h2>
          <button type="submit" class="primary-btn set-modal-save" form="set-form">Save set</button>
        </div>
        <form class="modal-body" id="set-form">
          <div class="form-grid">
            <div class="two-col">
              <div class="field-group">
                <label>Weight <span class="required-dot">•</span></label>
                <input name="weight" type="number" inputmode="decimal" step="0.5" min="0" required placeholder="0" value="${escapeAttr(entry.weight || '')}" />
              </div>
              <div class="field-group">
                <label>Repetitions <span class="required-dot">•</span></label>
                <input name="reps" type="number" inputmode="numeric" step="1" min="0" required placeholder="0" value="${escapeAttr(entry.reps || '')}" />
              </div>
            </div>
            <div class="two-col">
              <div class="field-group">
                <label>Date</label>
                <input name="date" type="date" value="${escapeAttr(toInputDate(entry.loggedAt))}" />
              </div>
              <div class="field-group">
                <label>Time</label>
                <input name="time" type="time" value="${escapeAttr(toInputTime(entry.loggedAt))}" />
              </div>
            </div>
            <div class="field-group">
              <label>Notes</label>
              <textarea name="notes" placeholder="Optional notes">${safeText(entry.notes || '')}</textarea>
            </div>
            <div class="helper-text">Only weight and repetitions are required. Notes remain optional.</div>
          </div>
        </form>
      </section>
    </div>
  `;
}

export function renderConfirmSheet() {
  if (!state.confirmSheet) return '';
  const sheet = state.confirmSheet;
  return `
    <div class="sheet-backdrop fade-in" data-action="close-sheet">
      <section class="sheet slide-up" role="dialog" aria-modal="true">
        <div class="sheet-header">
          <div>
            <h2>${safeText(sheet.title)}</h2>
            <p class="meta-text">${safeText(sheet.message)}</p>
          </div>
          <button class="round-btn" data-action="close-sheet" aria-label="Close">${icon.close}</button>
        </div>
        <div class="sheet-actions">
          <button class="sheet-action" data-action="close-sheet">Cancel</button>
          <button class="sheet-action danger" data-action="confirm-sheet">Delete</button>
        </div>
      </section>
    </div>
  `;
}

export function renderToast() {
  if (!state.toast) return '';
  return `
    <div class="toast-layer">
      <div class="toast slide-up">
        <span>${safeText(state.toast.message)}</span>
        ${state.toast.undo ? '<button data-action="undo-toast">Undo</button>' : ''}
      </div>
    </div>
  `;
}
