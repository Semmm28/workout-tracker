import { writeChanges } from './database.js';
import { loadState } from './data.js';
import { state } from './state.js';
import { clone, nowIso } from './utils.js';
import { validTraining } from './training-model.js';

export function buildExportPayload() {
  return {
    version: 2,
    exportedAt: nowIso(),
    brands: clone(state.brands),
    machines: clone([...state.machines, ...(state.orphaned?.machines || [])]),
    sets: clone([...state.sets, ...(state.orphaned?.sets || [])]),
    bodyweights: clone(state.bodyweights),
    plans: clone(state.plans),
    sessions: clone(state.sessions),
  };
}

export function isValidImportRecord(record, type) {
  if (!record || typeof record !== 'object' || typeof record.id !== 'string' || !record.id) return false;
  if (type === 'plans' || type === 'sessions') return validTraining(record, type);
  if (type === 'brands') return typeof record.name === 'string' && Boolean(record.name);
  if (type === 'machines') return typeof record.brandId === 'string' && typeof record.name === 'string' && Boolean(record.brandId && record.name);
  if (type === 'sets') {
    return typeof record.machineId === 'string' && Boolean(record.machineId && record.loggedAt)
      && Number.isFinite(Number(record.weight))
      && Number.isFinite(Number(record.reps));
  }
  if (type === 'bodyweights') {
    return Boolean(record.id && record.loggedAt) && Number.isFinite(Number(record.weight));
  }
  return false;
}

export function sanitizeImportData(data) {
  const payload = data && typeof data === 'object' ? data : {};
  if (![1, 2].includes(payload.version ?? 1)) throw new Error('Werk Workout Log bij om deze back-up te importeren.');
  const result = {};
  for (const kind of ['brands','machines','sets','bodyweights','plans','sessions']) {
    const records = payload[kind] ?? [];
    const strict = payload.version === 2 || kind === 'plans' || kind === 'sessions';
    if (strict && (!Array.isArray(records) || records.some(record=>!isValidImportRecord(record,kind)))) throw new Error('Ongeldige back-up; er is niets geïmporteerd.');
    result[kind] = Array.isArray(records) ? records.filter(record=>isValidImportRecord(record,kind)) : [];
    if(new Set(result[kind].map(r=>r.id)).size!==result[kind].length)throw new Error('Dubbele IDs in back-up.');
  }
  return result;
}

export async function importDataFile(file) {
  const text = await file.text();
  const parsed = JSON.parse(text);
  const sanitized = sanitizeImportData(parsed);
  const total = Object.values(sanitized).reduce((sum, records)=>sum+records.length,0);

  if (!total) return 0;
  // Import is an explicit local edit, including when it restores a deleted ID.
  await writeChanges(Object.entries(sanitized).flatMap(([kind, records]) => records.map((record) => ({ kind, id: record.id, record }))));
  await loadState();
  return total;
}
