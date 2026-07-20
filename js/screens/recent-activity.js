import { icon } from '../constants.js';
import { groupedRecentActivity } from '../selectors.js';
import { state } from '../state.js';
import { estimateE1rm, formatTime, formatWeight, safeText } from '../utils.js';
import { renderHeader } from '../ui/components.js';

function renderRecentActivityRow(item, setNumber) {
  const { entry, machine, brand } = item;
  const optional = [`<div class="tag-chip">Set ${setNumber}</div>`];
  if (brand?.name) optional.push(`<div class="tag-chip">${safeText(brand.name)}</div>`);
  if (entry.notes) optional.push(`<div class="tag-chip">${safeText(entry.notes)}</div>`);
  const e1rm = formatWeight(estimateE1rm(Number(entry.weight), Number(entry.reps)));

  return `
    <div
      class="list-item set-card compact-set-card"
      role="button"
      tabindex="0"
      data-action="open-recent-machine"
      data-id="${entry.machineId}"
      data-brand-id="${machine?.brandId || ''}"
    >
      <div class="set-card-top compact">
        <div>
          <div class="set-name">${safeText(machine?.name || 'Unknown machine')}</div>
          <div class="item-subtitle">${safeText(formatTime(entry.loggedAt))}</div>
        </div>
        <div class="set-summary" aria-label="Set summary">
          <div class="set-summary-item set-summary-box">
            <span class="set-summary-label">Weight</span>
            <strong>${safeText(entry.weight)} kg</strong>
          </div>
          <div class="set-summary-item set-summary-box">
            <span class="set-summary-label">Reps</span>
            <strong>${safeText(entry.reps)}</strong>
          </div>
          <div class="set-summary-item set-summary-box">
            <span class="set-summary-label">e1RM</span>
            <strong>${safeText(e1rm)} kg</strong>
          </div>
        </div>
      </div>
      <div class="optional-row">${optional.join('')}</div>
    </div>
  `;
}

function renderRecentActivityGroup(group) {
  return `
    <section class="date-group slide-up ${group.expanded ? 'is-expanded' : ''}">
      <button class="date-toggle" data-action="toggle-recent-group" data-id="${group.key}" aria-expanded="${group.expanded ? 'true' : 'false'}">
        <span class="date-toggle-copy">
          <span class="date-toggle-title">${safeText(group.displayDate)}</span>
          <span class="muted">${group.items.length} set${group.items.length === 1 ? '' : 's'}</span>
        </span>
        <span class="date-toggle-icon" aria-hidden="true">${icon.chevron}</span>
      </button>
      ${group.expanded ? `
        <div class="set-stack">
          ${group.items.map((item, index) => renderRecentActivityRow(item, index + 1)).join('')}
        </div>
      ` : ''}
    </section>
  `;
}

export function renderRecentActivityScreen() {
  const groups = groupedRecentActivity();

  return `
    <section class="screen-shell">
      <div class="screen-top fade-in">
        ${renderHeader({
          title: 'Recente activiteit',
          subtitle: `${state.sets.length} gelogde set${state.sets.length === 1 ? '' : 's'}`,
        })}
      </div>
      <div class="screen-scroll">
        <div class="detail-stack fade-in">
          ${groups.length
            ? groups.map((group) => renderRecentActivityGroup(group)).join('')
            : `
              <section class="empty-state">
                <div class="loading-logo">RA</div>
                <h2>Nog geen recente activiteit</h2>
                <p>Zodra je sets logt, verschijnt hier per dag een overzicht van je trainingen.</p>
              </section>
            `
          }
        </div>
      </div>
    </section>
  `;
}
