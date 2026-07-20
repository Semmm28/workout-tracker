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
  state.machines = machines.sort((a, b) => (a.sortOrder ?? 0) - (b.sortOrder ?? 0) || a.name.localeCompare(b.name));
  state.sets = sets.sort((a, b) => new Date(b.loggedAt) - new Date(a.loggedAt));
  state.bodyweights = bodyweights.sort((a, b) => new Date(a.loggedAt) - new Date(b.loggedAt));
  state.preferences.chartSeriesMode = readChartSeriesMode();
}
