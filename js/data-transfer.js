import { bulkPut } from './database.js';
import { loadState } from './data.js';
import { state } from './state.js';
import { clone, nowIso } from './utils.js';

export function buildExportPayload() {
  return {
    version: 1,
    exportedAt: nowIso(),
    brands: clone(state.brands),
    machines: clone(state.machines),
    sets: clone(state.sets),
    bodyweights: clone(state.bodyweights),
  };
}

export function isValidImportRecord(record, type) {
  if (!record || typeof record !== 'object') return false;
  if (type === 'brands') return Boolean(record.id && record.name);
  if (type === 'machines') return Boolean(record.id && record.brandId && record.name);
  if (type === 'sets') {
    return Boolean(record.id && record.machineId && record.loggedAt)
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
  return {
    brands: Array.isArray(payload.brands) ? payload.brands.filter((record) => isValidImportRecord(record, 'brands')) : [],
    machines: Array.isArray(payload.machines) ? payload.machines.filter((record) => isValidImportRecord(record, 'machines')) : [],
    sets: Array.isArray(payload.sets) ? payload.sets.filter((record) => isValidImportRecord(record, 'sets')) : [],
    bodyweights: Array.isArray(payload.bodyweights) ? payload.bodyweights.filter((record) => isValidImportRecord(record, 'bodyweights')) : [],
  };
}

export async function importDataFile(file) {
  const text = await file.text();
  const parsed = JSON.parse(text);
  const sanitized = sanitizeImportData(parsed);
  const total = sanitized.brands.length
    + sanitized.machines.length
    + sanitized.sets.length
    + sanitized.bodyweights.length;

  if (!total) return 0;
  if (sanitized.brands.length) await bulkPut('brands', sanitized.brands);
  if (sanitized.machines.length) await bulkPut('machines', sanitized.machines);
  if (sanitized.sets.length) await bulkPut('sets', sanitized.sets);
  if (sanitized.bodyweights.length) await bulkPut('bodyweights', sanitized.bodyweights);
  await loadState();
  return total;
}
