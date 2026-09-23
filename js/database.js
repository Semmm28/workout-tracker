import { compareEnvelopes, ENTITY_STORES, entityKey, makeEnvelope, revisionTime, validateEnvelope } from './sync-model.js';

const DB_NAME = 'workout-tracker-db';
const DB_VERSION = 3;
const SYNC_STORES = ['syncRecords', 'syncMeta'];
const listeners = new Set();

export function onDatabaseChange(listener) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

let dbPromise;

export function openDb() {
  if (dbPromise) return dbPromise;
  dbPromise = new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);
    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains('syncRecords')) db.createObjectStore('syncRecords', { keyPath: 'key' });
      if (!db.objectStoreNames.contains('syncMeta')) db.createObjectStore('syncMeta', { keyPath: 'key' });
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
      if (!db.objectStoreNames.contains('bodyweights')) {
        const bodyweights = db.createObjectStore('bodyweights', { keyPath: 'id' });
        bodyweights.createIndex('loggedAt', 'loggedAt');
      }
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
  return dbPromise;
}

export async function tx(storeName, mode, executor) {
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

export async function txMulti(storeNames, mode, executor) {
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

export async function getAll(storeName) {
  return tx(storeName, 'readonly', (store) => {
    const request = store.getAll();
    return new Promise((resolve, reject) => {
      request.onsuccess = () => resolve(request.result || []);
      request.onerror = () => reject(request.error);
    });
  });
}

// Data and its sync journal always commit in the same IndexedDB transaction.
// Keeping the full journal makes replay after a terminated WebView idempotent.
export async function writeChanges(changes) {
  if (!changes.length) return;
  for (const change of changes) {
    if (!ENTITY_STORES.includes(change.kind) || typeof change.id !== 'string' || !change.id) throw new Error('Invalid record ID');
  }
  await txMulti([...ENTITY_STORES, ...SYNC_STORES], 'readwrite', (stores) => {
    const clock = stores.syncMeta.get('clock');
    clock.onsuccess = () => {
      let time = Math.max(Date.now(), Number(clock.result?.value || 0));
      for (const change of changes) {
        const revision = `${String(++time).padStart(16, '0')}-${crypto.randomUUID()}`;
        const record = change.deleted ? { id: change.id } : { ...change.record, updatedAt: new Date().toISOString() };
        const envelope = makeEnvelope(change.kind, record, revision, Boolean(change.deleted));
        stores.syncRecords.put(envelope);
        if (change.deleted) stores[change.kind].delete(change.id);
        else stores[change.kind].put(record);
      }
      stores.syncMeta.put({ key: 'clock', value: time });
    };
  });
  listeners.forEach((listener) => listener());
}

export async function saveRecord(kind, record) {
  await writeChanges([{ kind, id: record.id, record }]);
  return record;
}

export async function bulkPut(kind, records) {
  await writeChanges(records.map((record) => ({ kind, id: record.id, record })));
  return records;
}

export async function deleteById(kind, id) {
  await writeChanges([{ kind, id, deleted: true }]);
  return true;
}

export async function syncMeta(key, value) {
  if (arguments.length === 2) return tx('syncMeta', 'readwrite', (store) => { store.put({ key, value }); });
  return tx('syncMeta', 'readonly', (store) => new Promise((resolve, reject) => {
    const request = store.get(key);
    request.onsuccess = () => resolve(request.result?.value);
    request.onerror = () => reject(request.error);
  }));
}

export async function seedSyncJournal() {
  // Preserve IDs/timestamps from pre-iCloud versions. This transaction can run
  // repeatedly and never converts a retained deletion back into a live record.
  await txMulti([...ENTITY_STORES, ...SYNC_STORES], 'readwrite', (stores) => {
    for (const kind of ENTITY_STORES) {
      const request = stores[kind].getAll();
      request.onsuccess = () => {
        for (const record of request.result) {
          const existing = stores.syncRecords.get(entityKey(kind, record.id));
          existing.onsuccess = () => {
            if (existing.result) return;
            const parsed = Date.parse(record.updatedAt || record.createdAt || '');
            const time = Math.max(0, Number.isFinite(parsed) ? Math.min(parsed, Date.now()) : 0);
            stores.syncRecords.put(makeEnvelope(kind, record, `${String(time).padStart(16, '0')}-legacy`));
          };
        }
      };
    }
  });
}

export async function mergeCloudChanges(envelopes, owner) {
  // Validate the entire response before starting a transaction. Unknown schema
  // versions must not advance the replica or silently discard user data.
  const values = envelopes.map(validateEnvelope);
  let changed = false;
  await txMulti([...ENTITY_STORES, ...SYNC_STORES], 'readwrite', (stores, transaction) => {
    const binding = stores.syncMeta.get('owner');
    binding.onsuccess = () => {
      if (!owner || binding.result?.value !== owner) { transaction.abort(); return; }
      const clock = stores.syncMeta.get('clock');
      clock.onsuccess = () => {
        const time = envelopes.reduce((max, entry) => Math.max(max, revisionTime(entry.revision)), Number(clock.result?.value || 0));
        stores.syncMeta.put({ key: 'clock', value: time });
      };
      envelopes.forEach((envelope, index) => {
        const request = stores.syncRecords.get(envelope.key);
        request.onsuccess = () => {
          if (compareEnvelopes(envelope, request.result) <= 0) return;
          changed = true;
          stores.syncRecords.put(envelope);
          if (envelope.deleted) stores[envelope.kind].delete(envelope.id);
          else stores[envelope.kind].put(values[index]);
        };
      });
    };
  });
  return changed;
}
