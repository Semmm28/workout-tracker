import { getAll } from './database.js';
import { state } from './state.js';
import { readChartSeriesMode } from './utils.js';

export async function loadState() {
  const [brands, machines, sets, bodyweights] = await Promise.all([
    getAll('brands'),
    getAll('machines'),
    getAll('sets'),
    getAll('bodyweights'),
  ]);
  state.brands = brands.sort((a, b) => (a.sortOrder ?? 0) - (b.sortOrder ?? 0) || a.name.localeCompare(b.name));
  const brandIds = new Set(brands.map((record) => record.id));
  state.machines = machines.filter((record) => brandIds.has(record.brandId)).sort((a, b) => (a.sortOrder ?? 0) - (b.sortOrder ?? 0) || a.name.localeCompare(b.name));
  const machineIds = new Set(state.machines.map((record) => record.id));
  state.sets = sets.filter((record) => machineIds.has(record.machineId)).sort((a, b) => new Date(b.loggedAt) - new Date(a.loggedAt));
  // A parent and child can arrive in different CloudKit batches. Retain hidden
  // children in storage and exports, and show them once their parent exists.
  state.orphaned = { machines: machines.filter((record) => !brandIds.has(record.brandId)), sets: sets.filter((record) => !machineIds.has(record.machineId)) };
  state.bodyweights = bodyweights.sort((a, b) => new Date(a.loggedAt) - new Date(b.loggedAt));
  state.preferences.chartSeriesMode = readChartSeriesMode();
}
