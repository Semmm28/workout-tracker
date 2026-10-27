import { getAll } from './database.js';
import { state } from './state.js';
import { readChartSeriesMode } from './utils.js';
import { compareSetsChronologically } from './selectors.js';

export async function loadState() {
  const [brands, machines, sets, bodyweights, plans, sessions] = await Promise.all([
    getAll('brands'),
    getAll('machines'),
    getAll('sets'),
    getAll('bodyweights'), getAll('plans'), getAll('sessions'),
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
  state.plans = plans.sort((a,b)=>a.name.localeCompare(b.name));
  state.sessions = sessions.sort((a,b)=>Date.parse(b.loggedAt)-Date.parse(a.loggedAt));
  state.setsByMachine = new Map(); state.lastSets = new Map();
  for (const entry of state.sets) {
    if (!state.setsByMachine.has(entry.machineId)) state.setsByMachine.set(entry.machineId, []);
    state.setsByMachine.get(entry.machineId).push(entry);
    const last = state.lastSets.get(entry.machineId);
    if (!last || compareSetsChronologically(entry, last) > 0) state.lastSets.set(entry.machineId, entry);
  }
  state.preferences.chartSeriesMode = readChartSeriesMode();
}
