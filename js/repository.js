import { bulkPut, saveRecord, writeChanges } from './database.js';
import { loadState } from './data.js';
import { state } from './state.js';
import { clone, nowIso, uid } from './utils.js';

export function getMachineCascade(brandId) {
  const machines = state.machines.filter((machine) => machine.brandId === brandId);
  const machineIds = new Set(machines.map((machine) => machine.id));
  const sets = state.sets.filter((entry) => machineIds.has(entry.machineId));
  return { machines, sets };
}

export async function deleteBrandCascade(brandId) {
  const { machines, sets } = getMachineCascade(brandId);
  const snapshot = {
    brands: clone(state.brands.filter((brand) => brand.id === brandId)),
    machines: clone(machines),
    sets: clone(sets),
  };
  await writeChanges(Object.entries(snapshot).flatMap(([kind, records]) => records.map(({ id }) => ({ kind, id, deleted: true }))));
  await loadState();
  return snapshot;
}

export async function deleteMachineCascade(machineId) {
  const snapshot = {
    machines: clone(state.machines.filter((machine) => machine.id === machineId)),
    sets: clone(state.sets.filter((entry) => entry.machineId === machineId)),
  };
  await writeChanges(Object.entries(snapshot).flatMap(([kind, records]) => records.map(({ id }) => ({ kind, id, deleted: true }))));
  await loadState();
  return snapshot;
}

export async function restoreSnapshot(snapshot) {
  await writeChanges(Object.entries(snapshot).flatMap(([kind, records]) => records.map((record) => ({ kind, id: record.id, record }))));
  await loadState();
}

export async function saveBrand(name, existing = null) {
  const record = existing
    ? { ...existing, name, updatedAt: nowIso() }
    : { id: uid('brand'), name, sortOrder: state.brands.length, createdAt: nowIso(), updatedAt: nowIso() };
  await saveRecord('brands', record);
  await loadState();
}

export async function saveMachine(name, note = '', existing = null) {
  const brandId = state.route.brandId;
  const brandMachines = state.machines.filter((machine) => machine.brandId === brandId);
  const record = existing
    ? { ...existing, name, note, updatedAt: nowIso() }
    : { id: uid('machine'), brandId, name, note, sortOrder: brandMachines.length, createdAt: nowIso(), updatedAt: nowIso() };
  await saveRecord('machines', record);
  await loadState();
}

export async function saveSet(payload, existing = null) {
  const record = existing
    ? { ...existing, ...payload, updatedAt: nowIso() }
    : { id: uid('set'), machineId: state.route.machineId, ...payload, createdAt: nowIso(), updatedAt: nowIso() };
  await saveRecord('sets', record);
  await loadState();
}

export async function saveBodyweight(payload, existing = null) {
  const record = existing
    ? { ...existing, ...payload, updatedAt: nowIso() }
    : { id: uid('bodyweight'), ...payload, createdAt: nowIso(), updatedAt: nowIso() };
  await saveRecord('bodyweights', record);
  await loadState();
}

export async function reorderItems(storeName, items) {
  const updated = items.map((item, index) => ({ ...item, sortOrder: index, updatedAt: nowIso() }));
  await bulkPut(storeName, updated);
  await loadState();
}
