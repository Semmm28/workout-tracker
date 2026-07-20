import { state } from './state.js';
import { estimateE1rm, formatDate, formatDateKey } from './utils.js';

export function currentBrand() {
  return state.brands.find((brand) => brand.id === state.route.brandId) || null;
}

export function currentMachine() {
  return state.machines.find((machine) => machine.id === state.route.machineId) || null;
}

export function machineCountByBrand(brandId) {
  return state.machines.filter((machine) => machine.brandId === brandId).length;
}

export function setCountByMachine(machineId) {
  return state.sets.filter((entry) => entry.machineId === machineId).length;
}

export function getVisibleBrands() {
  const query = state.search.brands.trim().toLowerCase();
  return state.brands.filter((brand) => brand.name.toLowerCase().includes(query));
}

export function getVisibleMachines(brandId) {
  const query = state.search.machines.trim().toLowerCase();
  return state.machines
    .filter((machine) => machine.brandId === brandId)
    .filter((machine) => machine.name.toLowerCase().includes(query));
}

export function getMachineSets(machineId) {
  return state.sets.filter((entry) => entry.machineId === machineId);
}

export function machineForSet(entry) {
  return state.machines.find((machine) => machine.id === entry.machineId) || null;
}

export function brandForMachine(machine) {
  if (!machine) return null;
  return state.brands.find((brand) => brand.id === machine.brandId) || null;
}

export function groupedSets(machineId) {
  const byDate = new Map();
  getMachineSets(machineId).forEach((entry) => {
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

export function groupedRecentActivity() {
  const byDate = new Map();

  state.sets.forEach((entry) => {
    const key = formatDateKey(entry.loggedAt);
    if (!key) return;

    const machine = machineForSet(entry);
    const brand = brandForMachine(machine);
    if (!byDate.has(key)) byDate.set(key, []);
    byDate.get(key).push({ entry, machine, brand });
  });

  return Array.from(byDate.entries())
    .sort((a, b) => new Date(b[0]) - new Date(a[0]))
    .map(([key, items]) => ({
      key,
      displayDate: formatDate(items[0].entry.loggedAt),
      items: items.sort((a, b) => new Date(a.entry.loggedAt) - new Date(b.entry.loggedAt)),
      expanded: Boolean(state.recentActivityExpanded[key]),
    }));
}

export function chartSeriesModeMetric(mode) {
  return mode === 'volumeMax' ? 'volume' : 'e1rm';
}

export function chartSeriesModeSetIndex(mode) {
  const match = /^set(\d+)$/.exec(mode);
  if (!match) return null;
  return Number(match[1]) - 1;
}

export function chartSeries(machineId, metric) {
  const mode = state.preferences.chartSeriesMode;
  if (metric !== chartSeriesModeMetric(mode)) return [];

  const dayGroups = groupedSets(machineId)
    .map((group) => {
      const dayKey = formatDateKey(group.items[0]?.loggedAt);
      const items = group.items
        .map((entry) => {
          const weight = Number(entry.weight);
          const reps = Number(entry.reps);
          if (!Number.isFinite(weight) || !Number.isFinite(reps)) return null;
          return {
            entry,
            weight,
            reps,
            dayKey,
            e1rm: estimateE1rm(weight, reps),
            volume: weight * reps,
            loggedAt: new Date(entry.loggedAt).getTime(),
          };
        })
        .filter(Boolean);

      if (!dayKey || !items.length) return null;
      return { dayKey, items };
    })
    .filter(Boolean)
    .sort((a, b) => new Date(a.dayKey) - new Date(b.dayKey));

  return dayGroups
    .map((group, index) => {
      const setIndex = chartSeriesModeSetIndex(mode);
      let selected = null;

      if (mode === 'e1rmMax') {
        selected = group.items.reduce((best, item) => {
          if (!best) return item;
          if (item.e1rm > best.e1rm) return item;
          if (item.e1rm === best.e1rm && item.loggedAt > best.loggedAt) return item;
          return best;
        }, null);
      } else if (mode === 'volumeMax') {
        selected = group.items.reduce((best, item) => {
          if (!best) return item;
          if (item.volume > best.volume) return item;
          if (item.volume === best.volume && item.loggedAt > best.loggedAt) return item;
          return best;
        }, null);
      } else if (setIndex !== null) {
        selected = group.items[setIndex] || null;
      }

      if (!selected) return null;
      return {
        id: selected.entry.id,
        xLabel: new Date(group.dayKey).toLocaleDateString('en-US', { month: 'short', day: 'numeric' }),
        value: metric === 'volume' ? selected.volume : selected.e1rm,
        order: index + 1,
      };
    })
    .filter(Boolean);
}

export function bodyweightSeries() {
  return state.bodyweights
    .filter((entry) => {
      const weight = Number(entry.weight);
      return Boolean(formatDateKey(entry.loggedAt)) && Number.isFinite(weight);
    })
    .map((entry, index) => ({
      id: entry.id,
      xLabel: new Date(entry.loggedAt).toLocaleDateString('en-US', { month: 'short', day: 'numeric' }),
      value: Number(entry.weight),
      order: index + 1,
    }));
}
