const DB_NAME = 'workout-tracker-db';
const DB_VERSION = 3;

let dbPromise;

export function openDb() {
  if (dbPromise) return dbPromise;
  dbPromise = new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);
    request.onupgradeneeded = () => {
      const db = request.result;
      for (const name of ['plans', 'sessions']) { if (!db.objectStoreNames.contains(name)) db.createObjectStore(name, { keyPath: 'id' }); }
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
    request.onblocked = () => reject(new Error('Sluit andere tabbladen van Workout Log en open de app opnieuw om bij te werken.'));
    request.onsuccess = () => { request.result.onversionchange = () => { request.result.close(); dbPromise = null; }; resolve(request.result); };
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
    transaction.onerror = () => reject(transaction.error || new Error("Opslaan is afgebroken. Open de training opnieuw en probeer nogmaals."));
    transaction.onabort = () => reject(transaction.error || new Error("Opslaan is afgebroken. Open de training opnieuw en probeer nogmaals."));
  });
}

export async function txMulti(storeNames, mode, executor) {
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const transaction = db.transaction(storeNames, mode);
    const stores = Object.fromEntries(storeNames.map((name) => [name, transaction.objectStore(name)]));
    const result = executor(stores, transaction);
    transaction.oncomplete = () => resolve(result);
    transaction.onerror = () => reject(transaction.error || new Error("Opslaan is afgebroken. Open de training opnieuw en probeer nogmaals."));
    transaction.onabort = () => reject(transaction.error || new Error("Opslaan is afgebroken. Open de training opnieuw en probeer nogmaals."));
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

export async function saveRecord(storeName, record) {
  return tx(storeName, 'readwrite', (store) => {
    const request = store.put(record);
    return new Promise((resolve, reject) => {
      request.onsuccess = () => resolve(record);
      request.onerror = () => reject(request.error);
    });
  });
}

export async function bulkPut(storeName, records) {
  return tx(storeName, 'readwrite', (store) => Promise.all(records.map((record) => new Promise((resolve, reject) => {
    const request = store.put(record);
    request.onsuccess = () => resolve(record);
    request.onerror = () => reject(request.error);
  }))));
}

export async function deleteById(storeName, id) {
  return tx(storeName, 'readwrite', (store) => {
    const request = store.delete(id);
    return new Promise((resolve, reject) => {
      request.onsuccess = () => resolve(true);
      request.onerror = () => reject(request.error);
    });
  });
}

export async function writeChanges(changes) {
  if (!changes.length) return;
  const kinds = ['brands','machines','sets','bodyweights','plans','sessions'];
  if (changes.some(c=>!kinds.includes(c.kind)||typeof c.id !== 'string'||!c.id)) throw new Error('Ongeldige wijziging');
  await txMulti([...new Set(changes.map(c=>c.kind))], 'readwrite', (stores, transaction)=>{
    for (const c of changes.filter(c=>c.kind==='sessions' && c.record?.status==='active')) { const current=stores.sessions.get(c.id); current.onsuccess=()=>{if(current.result?.status==='completed')transaction.abort();}; }
    for (const c of changes) { if(c.deleted) stores[c.kind].delete(c.id); else stores[c.kind].put({...c.record,updatedAt:new Date().toISOString()}); }
  });
}
