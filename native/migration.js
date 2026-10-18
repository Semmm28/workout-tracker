export async function readLegacyDatabase(indexedDB, storage) {
  const db = await new Promise((resolve, reject) => {
    const request = indexedDB.open('workout-tracker-db');
    request.onerror = () => reject(request.error);
    request.onblocked = () => reject(new Error('Database is in use'));
    request.onsuccess = () => resolve(request.result);
  });
  try {
    const kinds = ['brands', 'machines', 'sets', 'bodyweights'];
    const names = [...db.objectStoreNames];
    if (names.length && kinds.some(name => !names.includes(name))) throw new Error('Incomplete legacy database');
    const records = names.length ? await new Promise((resolve, reject) => {
      const values = {};
      const tx = db.transaction(names, 'readonly');
      for (const name of names) {
        const request = tx.objectStore(name).getAll();
        request.onsuccess = () => { values[name] = request.result; };
      }
      tx.oncomplete = () => resolve(values);
      tx.onerror = () => reject(tx.error);
      tx.onabort = () => reject(tx.error);
    }) : {};
    return {
      backup: { version: 1, exportedAt: new Date().toISOString(), ...Object.fromEntries(kinds.map(kind => [kind, records[kind] || []])) },
      journal: records.syncRecords || [],
      owner: records.syncMeta?.find(row => row.key === 'owner')?.value || '',
      chartMode: storage.getItem('workout-tracker.chartSeriesMode') || 'e1rmMax',
    };
  } finally { db.close(); }
}

// Only the DEBUG native bridge can request this fixture in an isolated simulator.
export async function seedMigrationFixture(indexedDB, storage) {
  const db = await new Promise((resolve, reject) => {
    const request = indexedDB.open('workout-tracker-db', 3);
    request.onupgradeneeded = () => {
      for (const name of ['brands', 'machines', 'sets', 'bodyweights', 'syncRecords', 'syncMeta']) {
        if (!request.result.objectStoreNames.contains(name)) request.result.createObjectStore(name, {keyPath: name.startsWith('sync') ? 'key' : 'id'});
      }
    };
    request.onsuccess = () => resolve(request.result); request.onerror = () => reject(request.error);
  });
  await new Promise((resolve, reject) => {
    const tx = db.transaction([...db.objectStoreNames], 'readwrite');
    const stamp = '2026-10-18T10:00:00.000Z';
    tx.objectStore('brands').put({id:'fixture-brand',name:'Technogym',sortOrder:0,createdAt:stamp});
    tx.objectStore('machines').put({id:'fixture-machine',brandId:'fixture-brand',name:'Chest Press',note:'Stoel op stand 4',sortOrder:0});
    tx.objectStore('sets').put({id:'fixture-set',machineId:'fixture-machine',weight:'80',reps:'8',loggedAt:stamp,rpe:'8.5',notes:'Bestaande set',extra:{retained:true}});
    tx.objectStore('bodyweights').put({id:'fixture-weight',weight:'80.5',loggedAt:stamp});
    tx.oncomplete = resolve; tx.onerror = () => reject(tx.error); tx.onabort = () => reject(tx.error);
  });
  db.close(); storage.setItem('workout-tracker.chartSeriesMode','set2');
}
