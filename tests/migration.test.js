import assert from 'node:assert/strict';
import test from 'node:test';
import { IDBFactory } from 'fake-indexeddb';
import { readLegacyDatabase, seedMigrationFixture } from '../native/migration.js';

function storage() { const values = new Map(); return { getItem: key => values.get(key) ?? null, setItem: (key, value) => values.set(key, value) }; }
test('native migration reads all legacy fields and preferences without changing the database', async () => {
  const db = new IDBFactory(), preferences = storage();
  await seedMigrationFixture(db, preferences);
  const first = await readLegacyDatabase(db, preferences);
  const second = await readLegacyDatabase(db, preferences);
  assert.equal(first.backup.sets[0].weight, '80');
  assert.deepEqual(first.backup.sets[0].extra, { retained: true });
  assert.equal(first.backup.machines[0].note, 'Stoel op stand 4');
  assert.equal(first.chartMode, 'set2');
  assert.deepEqual(first.backup.sets, second.backup.sets);
  assert.deepEqual(first.journal, second.journal);
  assert.deepEqual((await db.databases()).map(d => d.version), [3]);
});
test('a clean install can migrate an empty database', async () => {
  const result = await readLegacyDatabase(new IDBFactory(), storage());
  assert.equal(result.backup.version, 1);
  assert.deepEqual(result.backup.sets, []);
  assert.equal(result.owner, '');
});
test('partial/corrupt legacy databases fail instead of being treated as an empty install', async () => {
  const factory = new IDBFactory();
  await new Promise((resolve,reject) => {
    const request = factory.open('workout-tracker-db', 1);
    request.onupgradeneeded = () => request.result.createObjectStore('brands',{keyPath:'id'});
    request.onsuccess = () => { request.result.close(); resolve(); }; request.onerror = () => reject(request.error);
  });
  await assert.rejects(readLegacyDatabase(factory, storage()), /Incomplete/);
});
