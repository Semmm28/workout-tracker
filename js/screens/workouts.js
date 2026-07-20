import { CHART_SERIES_OPTIONS, icon } from '../constants.js';
import {
  chartSeries,
  chartSeriesModeMetric,
  currentBrand,
  currentMachine,
  getVisibleBrands,
  getVisibleMachines,
  groupedSets,
  machineCountByBrand,
  setCountByMachine,
} from '../selectors.js';
import { state } from '../state.js';
import {
  buildInitials,
  escapeAttr,
  estimateE1rm,
  formatTime,
  formatWeight,
  previewText,
  safeText,
} from '../utils.js';
import {
  buildChartSvg,
  renderHeader,
  renderSwipeContainer,
} from '../ui/components.js';

function renderBrandRow(brand, index, total) {
  const machineCount = machineCountByBrand(brand.id);
  const tail = state.reorder.brands
    ? `<div class="reorder-controls">
        <button data-action="move-brand-up" data-id="${brand.id}" ${index === 0 ? 'disabled' : ''} aria-label="Move up">${icon.up}</button>
        <button data-action="move-brand-down" data-id="${brand.id}" ${index === total - 1 ? 'disabled' : ''} aria-label="Move down">${icon.down}</button>
      </div>`
    : `<div class="item-tail"><span>${machineCount} machine${machineCount === 1 ? '' : 's'}</span><span class="chevron">${icon.chevron}</span></div>`;

  const content = `
    <div class="list-item" role="button" tabindex="0" data-action="open-brand" data-id="${brand.id}">
      <div class="item-leading">${safeText(buildInitials(brand.name))}</div>
      <div class="item-body">
        <div class="item-title">${safeText(brand.name)}</div>
        <div class="item-subtitle">${machineCount} machine${machineCount === 1 ? '' : 's'}</div>
      </div>
      ${tail}
    </div>
  `;

  return renderSwipeContainer('brand', brand.id, content, state.reorder.brands);
}

export function renderBrandsScreen() {
  const brands = getVisibleBrands();
  const body = brands.length
    ? `<div class="list-wrap">${brands.map((brand, index) => renderBrandRow(brand, index, brands.length)).join('')}</div>`
    : `
      <section class="empty-state fade-in">
        <div class="loading-logo">WL</div>
        <h2>No brands yet</h2>
        <p>Create your first equipment brand to start organizing machines and workout sets.</p>
        <div><button class="primary-btn" data-action="open-brand-create">Add brand</button></div>
      </section>
    `;

  return `
    <section class="screen-shell">
      <div class="screen-top fade-in">
        ${renderHeader({
          title: 'Brands',
          subtitle: `${state.brands.length} total`,
          extraButtons: `
            <button class="small-btn ${state.reorder.brands ? 'active' : ''}" data-action="toggle-brand-reorder">${state.reorder.brands ? 'Done' : 'Sort'}</button>
            <button class="round-btn primary" data-action="open-brand-create" aria-label="Add brand">${icon.plus}</button>
          `,
        })}
        <section class="toolbar">
          <div class="search-wrap">
            <span class="search-icon">${icon.search}</span>
            <input id="brand-search" type="search" inputmode="search" autocomplete="off" placeholder="Search brands" value="${escapeAttr(state.search.brands)}" />
          </div>
          <div class="toolbar-row">
            <div class="meta-text">Swipe left for edit and delete</div>
            ${state.reorder.brands ? '<div class="helper-text">Use arrows to reorder</div>' : ''}
          </div>
        </section>
      </div>
      <div class="screen-scroll">${body}</div>
    </section>
  `;
}

function renderMachineRow(machine, index, total) {
  const count = setCountByMachine(machine.id);
  const tail = state.reorder.machines
    ? `<div class="reorder-controls">
        <button data-action="move-machine-up" data-id="${machine.id}" ${index === 0 ? 'disabled' : ''} aria-label="Move up">${icon.up}</button>
        <button data-action="move-machine-down" data-id="${machine.id}" ${index === total - 1 ? 'disabled' : ''} aria-label="Move down">${icon.down}</button>
      </div>`
    : `<div class="item-tail"><span>${count} set${count === 1 ? '' : 's'}</span><span class="chevron">${icon.chevron}</span></div>`;

  const content = `
    <div class="list-item" role="button" tabindex="0" data-action="open-machine" data-id="${machine.id}">
      <div class="item-leading">${safeText(buildInitials(machine.name))}</div>
      <div class="item-body">
        <div class="item-title">${safeText(machine.name)}</div>
        <div class="item-subtitle">${count} logged set${count === 1 ? '' : 's'}</div>
        ${machine.note ? `<div class="item-note-preview">${safeText(previewText(machine.note, 64))}</div>` : ''}
      </div>
      ${tail}
    </div>
  `;

  return renderSwipeContainer('machine', machine.id, content, state.reorder.machines);
}

export function renderMachinesScreen() {
  const brand = currentBrand();
  if (!brand) {
    return `
      <section class="screen-shell">
        <div class="screen-top fade-in">
          ${renderHeader({ title: 'Machines', showBack: true, onBack: 'go-brands' })}
        </div>
        <div class="screen-scroll">
          <section class="empty-state"><h2>Brand not found</h2><p>The selected brand no longer exists.</p></section>
        </div>
      </section>
    `;
  }
  const brandMachineCount = state.machines.filter((machine) => machine.brandId === brand.id).length;
  const machines = getVisibleMachines(brand.id);
  const body = machines.length
    ? `<div class="list-wrap">${machines.map((machine, index) => renderMachineRow(machine, index, machines.length)).join('')}</div>`
    : `
      <section class="empty-state fade-in">
        <div class="loading-logo">${safeText(buildInitials(brand.name))}</div>
        <h2>No machines yet</h2>
        <p>Add equipment under ${safeText(brand.name)} to keep your workout history organized.</p>
        <div><button class="primary-btn" data-action="open-machine-create">Add machine</button></div>
      </section>
    `;

  return `
    <section class="screen-shell">
      <div class="screen-top fade-in">
        ${renderHeader({
          title: brand.name,
          subtitle: `${brandMachineCount} machine${brandMachineCount === 1 ? '' : 's'}`,
          showBack: true,
          onBack: 'go-brands',
          extraButtons: `
            <button class="small-btn ${state.reorder.machines ? 'active' : ''}" data-action="toggle-machine-reorder">${state.reorder.machines ? 'Done' : 'Sort'}</button>
            <button class="round-btn primary" data-action="open-machine-create" aria-label="Add machine">${icon.plus}</button>
          `,
        })}
        <section class="toolbar">
          <div class="search-wrap">
            <span class="search-icon">${icon.search}</span>
            <input id="machine-search" type="search" inputmode="search" autocomplete="off" placeholder="Search machines" value="${escapeAttr(state.search.machines)}" />
          </div>
          <div class="toolbar-row">
            <div class="meta-text">Swipe left for edit and delete</div>
            ${state.reorder.machines ? '<div class="helper-text">Use arrows to reorder</div>' : ''}
          </div>
        </section>
      </div>
      <div class="screen-scroll">${body}</div>
    </section>
  `;
}

function renderChartCard(machineId) {
  const chartSeriesMode = state.preferences.chartSeriesMode;
  const metric = chartSeriesModeMetric(chartSeriesMode);
  const series = chartSeries(machineId, metric);
  return `
    <section class="chart-card slide-up">
      <div class="chart-meta">
        <span>${safeText(CHART_SERIES_OPTIONS[chartSeriesMode])}</span>
        <span>${series.length} point${series.length === 1 ? '' : 's'}</span>
      </div>
      <label class="chart-series-picker">
        <span>Graph view</span>
        <select data-action="set-chart-series-mode">
          <option value="e1rmMax" ${chartSeriesMode === 'e1rmMax' ? 'selected' : ''}>Best e1RM</option>
          <option value="volumeMax" ${chartSeriesMode === 'volumeMax' ? 'selected' : ''}>Top volume</option>
          <option value="set1" ${chartSeriesMode === 'set1' ? 'selected' : ''}>Set 1</option>
          <option value="set2" ${chartSeriesMode === 'set2' ? 'selected' : ''}>Set 2</option>
          <option value="set3" ${chartSeriesMode === 'set3' ? 'selected' : ''}>Set 3</option>
        </select>
      </label>
      <div class="chart-shell">
        ${series.length ? buildChartSvg(series) : '<div class="chart-empty">Add a few sets to see your progression over time.</div>'}
      </div>
    </section>
  `;
}

function renderSetRow(entry, setNumber) {
  const optional = [];
  if (entry.notes) optional.push(`<div class="tag-chip">${safeText(entry.notes)}</div>`);
  const e1rm = formatWeight(estimateE1rm(Number(entry.weight), Number(entry.reps)));

  const content = `
    <div class="list-item set-card compact-set-card">
      <div class="set-card-top compact">
        <div>
          <div class="set-name">Set ${setNumber}</div>
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
      ${optional.length ? `<div class="optional-row">${optional.join('')}</div>` : ''}
    </div>
  `;

  return renderSwipeContainer('set', entry.id, content, false);
}

function renderDateGroup(group) {
  return `
    <section class="date-group slide-up">
      <div class="date-heading">
        <h3>${safeText(group.displayDate)}</h3>
        <div class="muted">${group.items.length} set${group.items.length === 1 ? '' : 's'}</div>
      </div>
      <div class="set-stack">
        ${group.items.map((entry, index) => renderSetRow(entry, index + 1)).join('')}
      </div>
    </section>
  `;
}

export function renderMachineDetailScreen() {
  const machine = currentMachine();
  const brand = currentBrand();
  if (!machine || !brand) {
    return `
      <section class="screen-shell">
        <div class="screen-top fade-in">
          ${renderHeader({ title: 'Workout History', showBack: true, onBack: 'go-machines' })}
        </div>
        <div class="screen-scroll">
          <section class="empty-state"><h2>Machine not found</h2><p>The selected machine no longer exists.</p></section>
        </div>
      </section>
    `;
  }
  const groups = groupedSets(machine.id);
  return `
    <section class="screen-shell">
      <div class="screen-top fade-in">
        ${renderHeader({
          title: machine.name,
          subtitle: brand.name,
          showBack: true,
          onBack: 'go-machines',
          extraButtons: `<button class="round-btn primary" data-action="open-set-create" aria-label="Add set">${icon.plus}</button>`,
        })}
      </div>
      <div class="screen-scroll">
        <div class="detail-stack fade-in">
          ${machine.note ? `
            <section class="machine-note-card slide-up">
              <div class="machine-note-label">Machine note</div>
              <div class="machine-note-text">${safeText(machine.note)}</div>
            </section>
          ` : ''}
          ${renderChartCard(machine.id)}
          ${groups.length
            ? groups.map((group) => renderDateGroup(group)).join('')
            : `
              <section class="empty-state">
                <div class="loading-logo">${safeText(buildInitials(machine.name))}</div>
                <h2>No sets logged yet</h2>
                <p>Track weight and reps to build a progression chart and workout history.</p>
                <div><button class="primary-btn" data-action="open-set-create">Add set</button></div>
              </section>
            `
          }
        </div>
      </div>
    </section>
  `;
}
