const DB_NAME = 'workout-tracker-db';
const DB_VERSION = 2;

let dbPromise;

export function openDb() {
  if (dbPromise) return dbPromise;
  dbPromise = new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);
    request.onupgradeneeded = () => {
      const db = request.result;
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
