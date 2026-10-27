import { getAll } from './database.js';
import { state } from './state.js';
import { readChartSeriesMode } from './utils.js';

export async function loadState() {
  const [brands, machines, sets, bodyweights, plans, sessions] = await Promise.all([
    getAll('brands'),
    getAll('machines'),
    getAll('sets'),
    getAll('bodyweights'), getAll('plans'), getAll('sessions'),
  ]);
  state.brands = brands.sort((a, b) => (a.sortOrder ?? 0) - (b.sortOrder ?? 0) || a.name.localeCompare(b.name));
  state.machines = machines.sort((a, b) => (a.sortOrder ?? 0) - (b.sortOrder ?? 0) || a.name.localeCompare(b.name));
  state.sets = sets.sort((a, b) => new Date(b.loggedAt) - new Date(a.loggedAt));
  state.bodyweights = bodyweights.sort((a, b) => new Date(a.loggedAt) - new Date(b.loggedAt));
  state.plans = plans.sort((a,b)=>a.name.localeCompare(b.name));
  state.sessions = sessions.sort((a,b)=>Date.parse(b.loggedAt)-Date.parse(a.loggedAt));
  state.setsByMachine = new Map(); state.lastSets = new Map();
  for (const entry of state.sets) {
    if (!state.setsByMachine.has(entry.machineId)) state.setsByMachine.set(entry.machineId, []);
    state.setsByMachine.get(entry.machineId).push(entry);
    const last = state.lastSets.get(entry.machineId);
    if (!last || Date.parse(entry.loggedAt) > Date.parse(last.loggedAt) || (entry.loggedAt === last.loggedAt && (entry.createdAt || '') > (last.createdAt || ''))) state.lastSets.set(entry.machineId, entry);
  }
  state.preferences.chartSeriesMode = readChartSeriesMode();
}
