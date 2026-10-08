import { getAll, mergeWatchChanges, onDatabaseChange, seedSyncJournal } from './database.js';

let plugin;
let timer;
let running = false;
let again = false;
let onChange = () => {};
export const watchStatus = { code: 'ready' };

export function buildWatchSnapshot(brands, machines, sets, journal) {
  const sort = (a, b) => (a.sortOrder ?? 0) - (b.sortOrder ?? 0) || a.name.localeCompare(b.name);
  const brandIds = new Set(brands.map(b => b.id));
  const validMachines = machines.filter(m => brandIds.has(m.brandId)).sort(sort);
  const machineIds = new Set(validMachines.map(m => m.id));
  const last = new Map();
  for (const set of [...sets].sort((a, b) => Date.parse(b.loggedAt) - Date.parse(a.loggedAt))) {
    if (machineIds.has(set.machineId) && !last.has(set.machineId)) last.set(set.machineId, set);
  }
  return {
    version: 1,
    brands: [...brands].sort(sort).map(({ id, name }) => ({ id, name })),
    machines: validMachines.map(({ id, name, brandId }) => ({ id, name, brandId })),
    lastSets: [...last.values()],
    // Retained tombstones stop an old offline Watch from resurrecting deletions.
    watchRecords: journal.filter(e => e.kind === 'sets' && e.id.startsWith('watch-')),
  };
}

export function scheduleWatchSync() {
  if (!plugin) return;
  clearTimeout(timer);
  timer = setTimeout(() => { void exchange(); }, 350);
}

async function exchange() {
  if (running) { again = true; return; }
  running = true;
  try {
    const { changes } = await plugin.pending();
    const incoming = JSON.parse(changes);
    if (await mergeWatchChanges(incoming)) await onChange();
    const data = await Promise.all(['brands', 'machines', 'sets', 'syncRecords'].map(getAll));
    // Only acknowledge after IndexedDB has committed, never on radio delivery.
    await plugin.publish({ snapshot: JSON.stringify(buildWatchSnapshot(...data)), acknowledgements: changes });
    watchStatus.code = 'ready';
  } catch {
    watchStatus.code = 'error';
    // Native inbox and Watch outbox retain unacknowledged sets for the next try.
  } finally {
    running = false;
    if (again) { again = false; scheduleWatchSync(); }
  }
}

export async function initializeWatchSync(changed) {
  plugin = globalThis.workoutNative?.watch;
  if (!plugin) return;
  onChange = changed;
  try {
    await seedSyncJournal();
    await plugin.addListener('watchChanged', scheduleWatchSync);
    onDatabaseChange(scheduleWatchSync);
    document.addEventListener('visibilitychange', () => { if (!document.hidden) scheduleWatchSync(); });
    setInterval(() => { if (!document.hidden) scheduleWatchSync(); }, 30_000);
    await exchange();
  } catch { watchStatus.code = 'error'; }
}
