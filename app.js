const DB_NAME = 'workout-tracker-db';
const DB_VERSION = 1;
const ACTION_WIDTH = 176;

const state = {
  ready: false,
  brands: [],
  machines: [],
  sets: [],
  route: { screen: 'brands', brandId: null, machineId: null },
  search: { brands: '', machines: '' },
  chartMetric: 'weight',
  reorder: { brands: false, machines: false },
  modal: null,
  confirmSheet: null,
  toast: null,
};

const app = document.getElementById('app');
let dbPromise;
let touchCleanup = null;
let toastTimer = null;

const icon = {
  plus: '＋',
  back: '‹',
  search: '⌕',
  close: '✕',
  chevron: '›',
  up: '↑',
  down: '↓',
};

function uid(prefix = 'id') {
  return `${prefix}_${crypto.randomUUID ? crypto.randomUUID() : `${Date.now()}_${Math.random().toString(16).slice(2)}`}`;
}

function nowIso() {
  return new Date().toISOString();
}

function parseDateTime(inputDate, inputTime, fallbackIso = nowIso()) {
  if (!inputDate) return fallbackIso;
  const time = inputTime || '12:00';
  const local = new Date(`${inputDate}T${time}`);
  if (Number.isNaN(local.getTime())) return fallbackIso;
  return local.toISOString();
}

function toInputDate(iso) {
  if (!iso) return '';
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return '';
  const y = date.getFullYear();
  const m = `${date.getMonth() + 1}`.padStart(2, '0');
  const d = `${date.getDate()}`.padStart(2, '0');
  return `${y}-${m}-${d}`;
}

function toInputTime(iso) {
  if (!iso) return '';
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return '';
  const h = `${date.getHours()}`.padStart(2, '0');
  const m = `${date.getMinutes()}`.padStart(2, '0');
  return `${h}:${m}`;
}

function formatDate(iso) {
  const date = new Date(iso);
  return date.toLocaleDateString('en-US', {
    weekday: 'short',
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  });
}

function formatTime(iso) {
  const date = new Date(iso);
  return date.toLocaleTimeString('en-US', {
    hour: 'numeric',
    minute: '2-digit',
  });
}

function formatDateKey(iso) {
  const d = new Date(iso);
  const y = d.getFullYear();
  const m = `${d.getMonth() + 1}`.padStart(2, '0');
  const day = `${d.getDate()}`.padStart(2, '0');
  return `${y}-${m}-${day}`;
}

function debounce(fn, ms = 120) {
  let timer;
  return (...args) => {
    clearTimeout(timer);
    timer = setTimeout(() => fn(...args), ms);
  };
}

function safeText(value) {
  return String(value ?? '').replace(/[&<>"']/g, (m) => ({
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    '"': '&quot;',
    "'": '&#39;'
  })[m]);
}

function clone(obj) {
  return structuredClone ? structuredClone(obj) : JSON.parse(JSON.stringify(obj));
}

function openDb() {
  if (dbPromise) return dbPromise;
  dbPromise = new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);
    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains('brands')) {
        const brands = db.createObjectStore('brands', { keyPath: 'id' });
        brands.createIndex('sortOrder', 'sortOrder');
      }
      if (!db.objectStoreNames.contains('machines')) {
        const machines = db.createObjectStore('machines', { keyPath: 'id' });
        machines.createIndex('brandId', 'brandId');
        machines.createIndex('brandId_sortOrder', ['brandId', 'sortOrder']);
      }
      if (!db.objectStoreNames.contains('sets')) {
        const sets = db.createObjectStore('sets', { keyPath: 'id' });
        sets.createIndex('machineId', 'machineId');
        sets.createIndex('machineId_loggedAt', ['machineId', 'loggedAt']);
      }
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
  return dbPromise;
}

async function tx(storeName, mode, executor) {
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const transaction = db.transaction(storeName, mode);
    const store = transaction.objectStore(storeName);
    const result = executor(store, transaction);
    transaction.oncomplete = () => resolve(result);
    transaction.onerror = () => reject(transaction.error);
    transaction.onabort = () => reject(transaction.error);
  });
}

async function txMulti(storeNames, mode, executor) {
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const transaction = db.transaction(storeNames, mode);
    const stores = Object.fromEntries(storeNames.map((name) => [name, transaction.objectStore(name)]));
    const result = executor(stores, transaction);
    transaction.oncomplete = () => resolve(result);
    transaction.onerror = () => reject(transaction.error);
    transaction.onabort = () => reject(transaction.error);
  });
}

async function getAll(storeName) {
  return tx(storeName, 'readonly', (store) => {
    const request = store.getAll();
    return new Promise((resolve, reject) => {
      request.onsuccess = () => resolve(request.result || []);
      request.onerror = () => reject(request.error);
    });
  });
}

async function saveRecord(storeName, record) {
  return tx(storeName, 'readwrite', (store) => {
    const request = store.put(record);
    return new Promise((resolve, reject) => {
      request.onsuccess = () => resolve(record);
      request.onerror = () => reject(request.error);
    });
  });
}

async function bulkPut(storeName, records) {
  return tx(storeName, 'readwrite', (store) => Promise.all(records.map((record) => new Promise((resolve, reject) => {
    const request = store.put(record);
    request.onsuccess = () => resolve(record);
    request.onerror = () => reject(request.error);
  }))));
}

async function deleteById(storeName, id) {
  return tx(storeName, 'readwrite', (store) => {
    const request = store.delete(id);
    return new Promise((resolve, reject) => {
      request.onsuccess = () => resolve(true);
      request.onerror = () => reject(request.error);
    });
  });
}

async function getMachineCascade(brandId) {
  const machines = state.machines.filter((m) => m.brandId === brandId);
  const machineIds = new Set(machines.map((m) => m.id));
  const sets = state.sets.filter((s) => machineIds.has(s.machineId));
  return { machines, sets };
}

async function deleteBrandCascade(brandId) {
  const snapshot = {
    brands: clone(state.brands),
    machines: clone(state.machines),
    sets: clone(state.sets),
  };
  const { machines, sets } = await getMachineCascade(brandId);
  await txMulti(['brands', 'machines', 'sets'], 'readwrite', (stores) => {
    stores.brands.delete(brandId);
    machines.forEach((m) => stores.machines.delete(m.id));
    sets.forEach((s) => stores.sets.delete(s.id));
  });
  await loadState();
  if (state.route.brandId === brandId) navigate({ screen: 'brands' }, true);
  return snapshot;
}

async function deleteMachineCascade(machineId) {
  const snapshot = {
    machines: clone(state.machines),
    sets: clone(state.sets),
  };
  const sets = state.sets.filter((s) => s.machineId === machineId);
  await txMulti(['machines', 'sets'], 'readwrite', (stores) => {
    stores.machines.delete(machineId);
    sets.forEach((s) => stores.sets.delete(s.id));
  });
  await loadState();
  if (state.route.machineId === machineId) navigate({ screen: 'machines', brandId: state.route.brandId }, true);
  return snapshot;
}

async function restoreSnapshot(snapshot) {
  if (snapshot.brands?.length) await bulkPut('brands', snapshot.brands);
  if (snapshot.machines?.length) await bulkPut('machines', snapshot.machines);
  if (snapshot.sets?.length) await bulkPut('sets', snapshot.sets);
  await loadState();
}

async function loadState() {
  const [brands, machines, sets] = await Promise.all([
    getAll('brands'),
    getAll('machines'),
    getAll('sets'),
  ]);
  state.brands = brands.sort((a, b) => (a.sortOrder ?? 0) - (b.sortOrder ?? 0) || a.name.localeCompare(b.name));
  state.machines = machines.sort((a, b) => (a.sortOrder ?? 0) - (b.sortOrder ?? 0) || a.name.localeCompare(b.name));
  state.sets = sets.sort((a, b) => new Date(b.loggedAt) - new Date(a.loggedAt));
}

function pushHistory(route) {
  const url = new URL(location.href);
  if (route.screen === 'brands') url.hash = '#/brands';
  if (route.screen === 'machines') url.hash = `#/brands/${route.brandId}`;
  if (route.screen === 'machineDetail') url.hash = `#/brands/${route.brandId}/machines/${route.machineId}`;
  history.pushState(route, '', url);
}

function deriveRouteFromHash() {
  const hash = location.hash.replace(/^#\/?/, '');
  if (!hash || hash === 'brands') return { screen: 'brands', brandId: null, machineId: null };
  const parts = hash.split('/');
  if (parts[0] === 'brands' && parts[1] && !parts[2]) return { screen: 'machines', brandId: parts[1], machineId: null };
  if (parts[0] === 'brands' && parts[1] && parts[2] === 'machines' && parts[3]) {
    return { screen: 'machineDetail', brandId: parts[1], machineId: parts[3] };
  }
  return { screen: 'brands', brandId: null, machineId: null };
}

function navigate(route, replace = false) {
  state.route = route;
  if (replace) {
    const url = new URL(location.href);
    if (route.screen === 'brands') url.hash = '#/brands';
    if (route.screen === 'machines') url.hash = `#/brands/${route.brandId}`;
    if (route.screen === 'machineDetail') url.hash = `#/brands/${route.brandId}/machines/${route.machineId}`;
    history.replaceState(route, '', url);
  } else {
    pushHistory(route);
  }
  closeSwipeRows();
  render();
}

function currentBrand() {
  return state.brands.find((brand) => brand.id === state.route.brandId) || null;
}

function currentMachine() {
  return state.machines.find((machine) => machine.id === state.route.machineId) || null;
}

function machineCountByBrand(brandId) {
  return state.machines.filter((m) => m.brandId === brandId).length;
}

function setCountByMachine(machineId) {
  return state.sets.filter((s) => s.machineId === machineId).length;
}

function getVisibleBrands() {
  const query = state.search.brands.trim().toLowerCase();
  return state.brands.filter((brand) => brand.name.toLowerCase().includes(query));
}

function getVisibleMachines(brandId) {
  const query = state.search.machines.trim().toLowerCase();
  return state.machines
    .filter((machine) => machine.brandId === brandId)
    .filter((machine) => machine.name.toLowerCase().includes(query));
}

function getMachineSets(machineId) {
  return state.sets.filter((entry) => entry.machineId === machineId);
}

function groupedSets(machineId) {
  const machineSets = getMachineSets(machineId);
  const byDate = new Map();
  machineSets.forEach((entry) => {
    const key = formatDateKey(entry.loggedAt);
    if (!byDate.has(key)) byDate.set(key, []);
    byDate.get(key).push(entry);
  });
  return Array.from(byDate.entries())
    .sort((a, b) => new Date(b[0]) - new Date(a[0]))
    .map(([, items]) => ({
      displayDate: formatDate(items[0].loggedAt),
      items: items.sort((a, b) => new Date(a.loggedAt) - new Date(b.loggedAt)),
    }));
}

function chartSeries(machineId, metric) {
  const entries = getMachineSets(machineId)
    .slice()
    .sort((a, b) => new Date(a.loggedAt) - new Date(b.loggedAt));
  return entries.map((entry, index) => ({
    id: entry.id,
    xLabel: new Date(entry.loggedAt).toLocaleDateString('en-US', { month: 'short', day: 'numeric' }),
    value: metric === 'weight'
      ? Number(entry.weight)
      : metric === 'reps'
        ? Number(entry.reps)
        : Number(entry.weight) * Number(entry.reps),
    order: index + 1,
  })).filter((point) => Number.isFinite(point.value));
}

function escapeAttr(value) {
  return safeText(value).replace(/"/g, '&quot;');
}

function renderHeader({ title, subtitle = '', showBack = false, onBack = '', extraButtons = '' }) {
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

function renderBrandsScreen() {
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
    ${renderHeader({
      title: 'Brands',
      subtitle: `${state.brands.length} total`,
      extraButtons: `
        <button class="small-btn ${state.reorder.brands ? 'active' : ''}" data-action="toggle-brand-reorder">${state.reorder.brands ? 'Done' : 'Sort'}</button>
        <button class="round-btn primary" data-action="open-brand-create" aria-label="Add brand">${icon.plus}</button>
      `,
    })}
    <section class="toolbar fade-in">
      <div class="search-wrap">
        <span class="search-icon">${icon.search}</span>
        <input id="brand-search" type="search" inputmode="search" autocomplete="off" placeholder="Search brands" value="${escapeAttr(state.search.brands)}" />
      </div>
      <div class="toolbar-row">
        <div class="meta-text">Swipe left for edit and delete</div>
        ${state.reorder.brands ? '<div class="helper-text">Use arrows to reorder</div>' : ''}
      </div>
    </section>
    ${body}
  `;
}

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
      <div class="item-leading">${safeText(brand.name.slice(0, 2).toUpperCase())}</div>
      <div class="item-body">
        <div class="item-title">${safeText(brand.name)}</div>
        <div class="item-subtitle">${machineCount} machine${machineCount === 1 ? '' : 's'}</div>
      </div>
      ${tail}
    </div>
  `;

  return renderSwipeContainer('brand', brand.id, content, state.reorder.brands);
}

function renderMachinesScreen() {
  const brand = currentBrand();
  if (!brand) {
    return `
      ${renderHeader({ title: 'Machines', showBack: true, onBack: 'go-brands' })}
      <section class="empty-state"><h2>Brand not found</h2><p>The selected brand no longer exists.</p></section>
    `;
  }
  const brandMachineCount = state.machines.filter((m) => m.brandId === brand.id).length;
  const machines = getVisibleMachines(brand.id);
  const body = machines.length
    ? `<div class="list-wrap">${machines.map((machine, index) => renderMachineRow(machine, index, machines.length)).join('')}</div>`
    : `
      <section class="empty-state fade-in">
        <div class="loading-logo">${safeText(brand.name.slice(0, 2).toUpperCase())}</div>
        <h2>No machines yet</h2>
        <p>Add equipment under ${safeText(brand.name)} to keep your workout history organized.</p>
        <div><button class="primary-btn" data-action="open-machine-create">Add machine</button></div>
      </section>
    `;

  return `
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
    <section class="toolbar fade-in">
      <div class="search-wrap">
        <span class="search-icon">${icon.search}</span>
        <input id="machine-search" type="search" inputmode="search" autocomplete="off" placeholder="Search machines" value="${escapeAttr(state.search.machines)}" />
      </div>
      <div class="toolbar-row">
        <div class="meta-text">Swipe left for edit and delete</div>
        ${state.reorder.machines ? '<div class="helper-text">Use arrows to reorder</div>' : ''}
      </div>
    </section>
    ${body}
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
      <div class="item-leading">${safeText(machine.name.slice(0, 2).toUpperCase())}</div>
      <div class="item-body">
        <div class="item-title">${safeText(machine.name)}</div>
        <div class="item-subtitle">${count} logged set${count === 1 ? '' : 's'}</div>
      </div>
      ${tail}
    </div>
  `;

  return renderSwipeContainer('machine', machine.id, content, state.reorder.machines);
}

function renderMachineDetailScreen() {
  const machine = currentMachine();
  const brand = currentBrand();
  if (!machine || !brand) {
    return `
      ${renderHeader({ title: 'Workout History', showBack: true, onBack: 'go-machines' })}
      <section class="empty-state"><h2>Machine not found</h2><p>The selected machine no longer exists.</p></section>
    `;
  }
  const groups = groupedSets(machine.id);
  return `
    ${renderHeader({
      title: machine.name,
      subtitle: brand.name,
      showBack: true,
      onBack: 'go-machines',
      extraButtons: `<button class="round-btn primary" data-action="open-set-create" aria-label="Add set">${icon.plus}</button>`,
    })}
    <div class="detail-stack fade-in">
      ${renderChartCard(machine.id)}
      ${groups.length
        ? groups.map((group) => renderDateGroup(group)).join('')
        : `
          <section class="empty-state">
            <div class="loading-logo">${safeText(machine.name.slice(0, 2).toUpperCase())}</div>
            <h2>No sets logged yet</h2>
            <p>Track weight and reps to build a progression chart and workout history.</p>
            <div><button class="primary-btn" data-action="open-set-create">Add set</button></div>
          </section>
        `
      }
    </div>
  `;
}

function renderChartCard(machineId) {
  const metricLabels = { weight: 'Weight', reps: 'Reps', volume: 'Volume' };
  const series = chartSeries(machineId, state.chartMetric);
  return `
    <section class="chart-card slide-up">
      <div class="segmented">
        ${Object.entries(metricLabels).map(([key, label]) => `
          <button class="${state.chartMetric === key ? 'active' : ''}" data-action="set-chart-metric" data-metric="${key}">${label}</button>
        `).join('')}
      </div>
      <div class="chart-meta">
        <span>${metricLabels[state.chartMetric]} progression</span>
        <span>${series.length} point${series.length === 1 ? '' : 's'}</span>
      </div>
      <div class="chart-shell">
        ${series.length ? buildChartSvg(series) : '<div class="chart-empty">Add a few sets to see your progression over time.</div>'}
      </div>
    </section>
  `;
}

function buildChartSvg(series) {
  const width = 320;
  const height = 190;
  const padX = 18;
  const padTop = 18;
  const padBottom = 26;
  const chartHeight = height - padTop - padBottom;
  const min = Math.min(...series.map((p) => p.value));
  const max = Math.max(...series.map((p) => p.value));
  const range = max - min || Math.max(max, 1);
  const points = series.map((point, idx) => {
    const x = series.length === 1 ? width / 2 : padX + ((width - padX * 2) * idx) / (series.length - 1);
    const y = padTop + chartHeight - (((point.value - min) / range) * chartHeight);
    return { ...point, x, y };
  });
  const line = points.map((p) => `${p.x},${p.y}`).join(' ');
  const area = `${padX},${height - padBottom} ${line} ${points[points.length - 1].x},${height - padBottom}`;
  const yTicks = [0, 0.5, 1].map((step) => {
    const y = padTop + chartHeight - step * chartHeight;
    const value = min + step * range;
    return { y, label: Number.isInteger(value) ? value : value.toFixed(1) };
  });
  const xLabels = points.length <= 5 ? points : [points[0], points[Math.floor((points.length - 1) / 2)], points[points.length - 1]];

  return `
    <svg class="chart-svg" viewBox="0 0 ${width} ${height}" role="img" aria-label="Progress chart">
      ${yTicks.map((tick) => `
        <line class="chart-grid-line" x1="${padX}" x2="${width - padX}" y1="${tick.y}" y2="${tick.y}" />
        <text class="chart-axis" x="0" y="${tick.y + 4}">${safeText(tick.label)}</text>
      `).join('')}
      <polygon class="chart-fill" points="${area}" />
      <polyline class="chart-path" points="${line}" />
      ${points.map((p) => `<circle class="chart-point" cx="${p.x}" cy="${p.y}" r="4.8"></circle>`).join('')}
      ${xLabels.map((p) => `<text class="chart-axis" text-anchor="middle" x="${p.x}" y="${height - 6}">${safeText(p.xLabel)}</text>`).join('')}
    </svg>
  `;
}

function renderDateGroup(group) {
  return `
    <section class="date-group slide-up">
      <div class="date-heading">
        <h3>${safeText(group.displayDate)}</h3>
        <div class="muted">${group.items.length} set${group.items.length === 1 ? '' : 's'}</div>
      </div>
      <div class="set-stack">
        ${group.items.map((entry, idx) => renderSetRow(entry, idx + 1)).join('')}
      </div>
    </section>
  `;
}

function renderSetRow(entry, setNumber) {
  const optional = [];
  if (entry.rpe) optional.push(`<div class="tag-chip">RPE ${safeText(entry.rpe)}</div>`);
  if (entry.restTime) optional.push(`<div class="tag-chip">Rest ${safeText(entry.restTime)}</div>`);
  if (entry.duration) optional.push(`<div class="tag-chip">Duration ${safeText(entry.duration)}</div>`);
  if (entry.notes) optional.push(`<div class="tag-chip">${safeText(entry.notes)}</div>`);

  const content = `
    <div class="list-item set-card">
      <div class="set-card-top">
        <div>
          <div class="set-name">Set ${setNumber}</div>
          <div class="item-subtitle">${safeText(formatTime(entry.loggedAt))}</div>
        </div>
        <div class="muted">${safeText(new Date(entry.loggedAt).toLocaleDateString('en-US', { month: 'short', day: 'numeric' }))}</div>
      </div>
      <div class="set-primary">
        <div class="metric-chip"><strong>Weight</strong><span>${safeText(entry.weight)}</span></div>
        <div class="metric-chip"><strong>Reps</strong><span>${safeText(entry.reps)}</span></div>
        <div class="metric-chip"><strong>Volume</strong><span>${safeText(Number(entry.weight) * Number(entry.reps))}</span></div>
      </div>
      ${optional.length ? `<div class="optional-row">${optional.join('')}</div>` : ''}
    </div>
  `;

  return renderSwipeContainer('set', entry.id, content, false);
}

function renderSwipeContainer(type, id, content, disabled) {
  if (disabled) return content;
  return `
    <div class="swipe-row" data-swipe-type="${type}" data-id="${id}">
      <div class="swipe-actions">
        <button class="edit" data-action="edit-${type}" data-id="${id}">Edit</button>
        <button class="delete" data-action="delete-${type}" data-id="${id}">Delete</button>
      </div>
      <div class="swipe-track">${content}</div>
    </div>
  `;
}

function renderModal() {
  if (!state.modal) return '';
  const modal = state.modal;
  const isBrand = modal.type === 'brand';
  const isMachine = modal.type === 'machine';
  const isSet = modal.type === 'set';
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
      <section class="modal slide-up" role="dialog" aria-modal="true" aria-label="${title}">
        <div class="modal-header">
          <h2>${title}</h2>
          <button class="round-btn" data-action="close-modal" aria-label="Close">${icon.close}</button>
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
            <div class="two-col">
              <div class="field-group">
                <label>RPE / effort</label>
                <input name="rpe" maxlength="16" placeholder="Optional" value="${escapeAttr(entry.rpe || '')}" />
              </div>
              <div class="field-group">
                <label>Rest time</label>
                <input name="restTime" maxlength="32" placeholder="Optional" value="${escapeAttr(entry.restTime || '')}" />
              </div>
            </div>
            <div class="field-group">
              <label>Duration</label>
              <input name="duration" maxlength="32" placeholder="Optional" value="${escapeAttr(entry.duration || '')}" />
            </div>
            <div class="field-group">
              <label>Notes</label>
              <textarea name="notes" placeholder="Optional notes">${safeText(entry.notes || '')}</textarea>
            </div>
            <div class="helper-text">Only weight and repetitions are required. Everything else is optional.</div>
          </div>
          <div class="modal-footer">
            <button type="button" class="secondary-btn" data-action="close-modal">Cancel</button>
            <button type="submit" class="primary-btn">Save set</button>
          </div>
        </form>
      </section>
    </div>
  `;
}

function renderConfirmSheet() {
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

function renderToast() {
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

function render() {
  if (!state.ready) {
    app.innerHTML = `
      <div class="loading-screen">
        <div class="loading-logo">WL</div>
        <h1>Workout Log</h1>
        <p>Preparing your offline workout tracker…</p>
      </div>
    `;
    return;
  }

  let screen = '';
  if (state.route.screen === 'brands') screen = renderBrandsScreen();
  if (state.route.screen === 'machines') screen = renderMachinesScreen();
  if (state.route.screen === 'machineDetail') screen = renderMachineDetailScreen();

  app.innerHTML = `
    <main class="app">
      <div class="phone-frame">${screen}</div>
      ${renderModal()}
      ${renderConfirmSheet()}
      ${renderToast()}
    </main>
  `;

  wireInputs();
  wireForms();
  wireSwipeRows();
}

function wireInputs() {
  const brandSearch = document.getElementById('brand-search');
  const machineSearch = document.getElementById('machine-search');
  if (brandSearch) brandSearch.addEventListener('input', debounce((event) => {
    state.search.brands = event.target.value;
    render();
  }, 10));
  if (machineSearch) machineSearch.addEventListener('input', debounce((event) => {
    state.search.machines = event.target.value;
    render();
  }, 10));
}

function wireForms() {
  const entityForm = document.getElementById('entity-form');
  if (entityForm) {
    entityForm.addEventListener('submit', async (event) => {
      event.preventDefault();
      const form = new FormData(entityForm);
      const name = String(form.get('name') || '').trim();
      if (!name) return;
      if (state.modal.type === 'brand') {
        await saveBrand(name, state.modal.mode === 'edit' ? state.modal.data : null);
      } else {
        await saveMachine(name, state.modal.mode === 'edit' ? state.modal.data : null);
      }
      closeModal();
    });
  }

  const setForm = document.getElementById('set-form');
  if (setForm) {
    setForm.addEventListener('submit', async (event) => {
      event.preventDefault();
      const form = new FormData(setForm);
      const weight = String(form.get('weight') || '').trim();
      const reps = String(form.get('reps') || '').trim();
      if (!weight || !reps) return;
      const payload = {
        weight,
        reps,
        loggedAt: parseDateTime(String(form.get('date') || ''), String(form.get('time') || ''), state.modal.mode === 'edit' ? state.modal.data.loggedAt : nowIso()),
        notes: String(form.get('notes') || '').trim(),
        rpe: String(form.get('rpe') || '').trim(),
        restTime: String(form.get('restTime') || '').trim(),
        duration: String(form.get('duration') || '').trim(),
      };
      await saveSet(payload, state.modal.mode === 'edit' ? state.modal.data : null);
      closeModal();
    });
  }
}

async function saveBrand(name, existing = null) {
  const record = existing
    ? { ...existing, name, updatedAt: nowIso() }
    : { id: uid('brand'), name, sortOrder: state.brands.length, createdAt: nowIso(), updatedAt: nowIso() };
  await saveRecord('brands', record);
  await loadState();
  render();
}

async function saveMachine(name, existing = null) {
  const brandId = state.route.brandId;
  const brandMachines = state.machines.filter((machine) => machine.brandId === brandId);
  const record = existing
    ? { ...existing, name, updatedAt: nowIso() }
    : { id: uid('machine'), brandId, name, sortOrder: brandMachines.length, createdAt: nowIso(), updatedAt: nowIso() };
  await saveRecord('machines', record);
  await loadState();
  render();
}

async function saveSet(payload, existing = null) {
  const record = existing
    ? { ...existing, ...payload, updatedAt: nowIso() }
    : { id: uid('set'), machineId: state.route.machineId, ...payload, createdAt: nowIso(), updatedAt: nowIso() };
  await saveRecord('sets', record);
  await loadState();
  render();
}

function openBrandModal(mode, data = null) {
  state.modal = { type: 'brand', mode, data };
  render();
}

function openMachineModal(mode, data = null) {
  state.modal = { type: 'machine', mode, data };
  render();
}

function openSetModal(mode, data = null) {
  state.modal = { type: 'set', mode, data };
  render();
}

function closeModal() {
  state.modal = null;
  render();
}

function openConfirmSheet(config) {
  state.confirmSheet = config;
  render();
}

function closeConfirmSheet() {
  state.confirmSheet = null;
  render();
}

function showToast(message, undo) {
  clearTimeout(toastTimer);
  state.toast = { message, undo };
  render();
  toastTimer = setTimeout(() => {
    state.toast = null;
    render();
  }, 4500);
}

function closeToast() {
  clearTimeout(toastTimer);
  state.toast = null;
  render();
}

async function reorderItems(storeName, items) {
  const updated = items.map((item, idx) => ({ ...item, sortOrder: idx, updatedAt: nowIso() }));
  await bulkPut(storeName, updated);
  await loadState();
  render();
}

async function moveBrand(direction, brandId) {
  const brands = state.brands.slice();
  const index = brands.findIndex((item) => item.id === brandId);
  const swapIndex = direction === 'up' ? index - 1 : index + 1;
  if (index < 0 || swapIndex < 0 || swapIndex >= brands.length) return;
  [brands[index], brands[swapIndex]] = [brands[swapIndex], brands[index]];
  await reorderItems('brands', brands);
}

async function moveMachine(direction, machineId) {
  const brandMachines = state.machines.filter((machine) => machine.brandId === state.route.brandId);
  const index = brandMachines.findIndex((item) => item.id === machineId);
  const swapIndex = direction === 'up' ? index - 1 : index + 1;
  if (index < 0 || swapIndex < 0 || swapIndex >= brandMachines.length) return;
  [brandMachines[index], brandMachines[swapIndex]] = [brandMachines[swapIndex], brandMachines[index]];
  const untouched = state.machines.filter((machine) => machine.brandId !== state.route.brandId);
  await reorderItems('machines', [...untouched, ...brandMachines]);
}

function closeSwipeRows() {
  document.querySelectorAll('.swipe-row').forEach((row) => {
    row.classList.remove('is-open', 'is-revealing');
    const track = row.querySelector('.swipe-track');
    if (track) track.style.transform = 'translateX(0px)';
  });
}

function wireSwipeRows() {
  if (touchCleanup) touchCleanup();
  const rows = Array.from(document.querySelectorAll('.swipe-row'));
  if (!rows.length) return;

  const listeners = [];
  let activeTrack = null;
  let startX = 0;
  let startTranslate = 0;
  let isDragging = false;

  const setOpenTrack = (track, open) => {
    rows.forEach((row) => {
      const t = row.querySelector('.swipe-track');
      if (t !== track) {
        row.classList.remove('is-open', 'is-revealing');
        if (t) t.style.transform = 'translateX(0px)';
      }
    });
    const row = track.closest('.swipe-row');
    if (row) {
      row.classList.toggle('is-open', open);
      row.classList.remove('is-revealing');
    }
    track.style.transform = `translateX(${open ? -ACTION_WIDTH : 0}px)`;
  };

  rows.forEach((row) => {
    const track = row.querySelector('.swipe-track');
    const onTouchStart = (event) => {
      const touch = event.touches[0];
      activeTrack = track;
      isDragging = true;
      startX = touch.clientX;
      row.classList.remove('is-open');
      const match = /translateX\((-?\d+)px\)/.exec(track.style.transform || 'translateX(0px)');
      startTranslate = match ? Number(match[1]) : 0;
      row.classList.toggle('is-revealing', startTranslate !== 0);
    };
    const onTouchMove = (event) => {
      if (!isDragging || activeTrack !== track) return;
      const touch = event.touches[0];
      const delta = touch.clientX - startX;
      const next = Math.min(0, Math.max(-ACTION_WIDTH, startTranslate + delta));
      row.classList.toggle('is-revealing', next < -6);
      track.style.transform = `translateX(${next}px)`;
    };
    const onTouchEnd = () => {
      if (!isDragging || activeTrack !== track) return;
      const match = /translateX\((-?\d+)px\)/.exec(track.style.transform || 'translateX(0px)');
      const current = match ? Number(match[1]) : 0;
      setOpenTrack(track, current < -68);
      isDragging = false;
      activeTrack = null;
    };

    row.addEventListener('touchstart', onTouchStart, { passive: true });
    row.addEventListener('touchmove', onTouchMove, { passive: true });
    row.addEventListener('touchend', onTouchEnd, { passive: true });
    listeners.push(() => row.removeEventListener('touchstart', onTouchStart));
    listeners.push(() => row.removeEventListener('touchmove', onTouchMove));
    listeners.push(() => row.removeEventListener('touchend', onTouchEnd));
  });

  const onBodyTouchStart = (event) => {
    if (!event.target.closest('.swipe-row')) closeSwipeRows();
  };
  document.addEventListener('touchstart', onBodyTouchStart, { passive: true });
  listeners.push(() => document.removeEventListener('touchstart', onBodyTouchStart));
  touchCleanup = () => listeners.forEach((fn) => fn());
}

function findBrand(id) {
  return state.brands.find((item) => item.id === id);
}

function findMachine(id) {
  return state.machines.find((item) => item.id === id);
}

function findSet(id) {
  return state.sets.find((item) => item.id === id);
}

async function handleDeleteSet(id) {
  const target = findSet(id);
  if (!target) return;
  await deleteById('sets', id);
  await loadState();
  showToast('Set deleted', async () => {
    await saveRecord('sets', target);
    await loadState();
    closeToast();
  });
  render();
}

function attachEventDelegation() {
  document.addEventListener('click', async (event) => {
    const target = event.target.closest('[data-action]');
    if (!target) return;
    const action = target.dataset.action;
    const id = target.dataset.id;
    const metric = target.dataset.metric;

    if (action === 'noop') return;
    if (action === 'backdrop-close' && event.target === target) return closeModal();
    if (action === 'close-modal') return closeModal();
    if (action === 'close-sheet') return closeConfirmSheet();
    if (action === 'undo-toast' && state.toast?.undo) return state.toast.undo();

    if (action === 'go-brands') return navigate({ screen: 'brands', brandId: null, machineId: null });
    if (action === 'go-machines') return navigate({ screen: 'machines', brandId: state.route.brandId, machineId: null });

    if (action === 'open-brand-create') return openBrandModal('create');
    if (action === 'open-machine-create') return openMachineModal('create');
    if (action === 'open-set-create') return openSetModal('create');

    if (action === 'open-brand') return navigate({ screen: 'machines', brandId: id, machineId: null });
    if (action === 'open-machine') return navigate({ screen: 'machineDetail', brandId: state.route.brandId, machineId: id });

    if (action === 'toggle-brand-reorder') {
      state.reorder.brands = !state.reorder.brands;
      render();
      return;
    }
    if (action === 'toggle-machine-reorder') {
      state.reorder.machines = !state.reorder.machines;
      render();
      return;
    }

    if (action === 'move-brand-up') return moveBrand('up', id);
    if (action === 'move-brand-down') return moveBrand('down', id);
    if (action === 'move-machine-up') return moveMachine('up', id);
    if (action === 'move-machine-down') return moveMachine('down', id);

    if (action === 'edit-brand') return openBrandModal('edit', findBrand(id));
    if (action === 'edit-machine') return openMachineModal('edit', findMachine(id));
    if (action === 'edit-set') return openSetModal('edit', findSet(id));

    if (action === 'delete-brand') {
      const brand = findBrand(id);
      if (!brand) return;
      const related = await getMachineCascade(id);
      return openConfirmSheet({
        title: `Delete ${brand.name}?`,
        message: `This will remove ${related.machines.length} machine${related.machines.length === 1 ? '' : 's'} and ${related.sets.length} logged set${related.sets.length === 1 ? '' : 's'} stored under this brand.`,
        confirm: async () => {
          const snapshot = await deleteBrandCascade(id);
          closeConfirmSheet();
          showToast('Brand deleted', async () => {
            await restoreSnapshot(snapshot);
            closeToast();
          });
        },
      });
    }

    if (action === 'delete-machine') {
      const machine = findMachine(id);
      if (!machine) return;
      const relatedSets = state.sets.filter((entry) => entry.machineId === id);
      return openConfirmSheet({
        title: `Delete ${machine.name}?`,
        message: `This will remove ${relatedSets.length} logged set${relatedSets.length === 1 ? '' : 's'} for this machine.`,
        confirm: async () => {
          const snapshot = await deleteMachineCascade(id);
          closeConfirmSheet();
          showToast('Machine deleted', async () => {
            await restoreSnapshot(snapshot);
            closeToast();
          });
        },
      });
    }

    if (action === 'delete-set') return handleDeleteSet(id);
    if (action === 'confirm-sheet' && state.confirmSheet?.confirm) return state.confirmSheet.confirm();
    if (action === 'set-chart-metric' && metric) {
      state.chartMetric = metric;
      render();
      return;
    }
  });
}

async function registerServiceWorker() {
  if ('serviceWorker' in navigator) {
    try {
      await navigator.serviceWorker.register('./sw.js');
    } catch (error) {
      console.warn('Service worker registration failed:', error);
    }
  }
}

async function init() {
  attachEventDelegation();
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
