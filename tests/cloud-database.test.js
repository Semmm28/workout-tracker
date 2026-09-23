import assert from 'node:assert/strict';
import { beforeEach, test } from 'node:test';
import 'fake-indexeddb/auto';
import { bulkPut, deleteById, getAll, mergeCloudChanges, onDatabaseChange, openDb, saveRecord, seedSyncJournal, syncMeta, tx, txMulti, writeChanges } from '../js/database.js';
import { compareEnvelopes, ENTITY_STORES, makeEnvelope } from '../js/sync-model.js';
import { deleteBrandCascade, restoreSnapshot } from '../js/repository.js';
import { buildExportPayload, importDataFile } from '../js/data-transfer.js';
import { loadState } from '../js/data.js';
import { state } from '../js/state.js';

globalThis.localStorage = { getItem: () => null };
const stores = [...ENTITY_STORES, 'syncRecords', 'syncMeta'];
const remote = (kind, record, time = Date.now() + 10000, deleted = false) => makeEnvelope(kind, record, `${String(time).padStart(16, '0')}-remote`, deleted);

beforeEach(async () => {
  await txMulti(stores, 'readwrite', (db) => stores.forEach((name) => db[name].clear()));
  await syncMeta('owner', 'account-a');
  await loadState();
});

test('existing v2 records seed once without changing IDs, dates or values', async () => {
  const record = { id: 'legacy', name: 'Gym', updatedAt: '2025-01-01T00:00:00.000Z' };
  await tx('brands', 'readwrite', (store) => store.put(record));
  await seedSyncJournal();
  const first = await getAll('syncRecords');
  await seedSyncJournal();
  assert.deepEqual(await getAll('syncRecords'), first);
  assert.deepEqual(await getAll('brands'), [record]);
  assert.equal(JSON.parse(first[0].value).id, 'legacy');
  assert.equal((await openDb()).version, 3);
});

test('a local edit and its durable journal commit together and notify only afterward', async () => {
  let count = 0;
  const stop = onDatabaseChange(() => { count++; });
  await saveRecord('brands', { id: 'b1', name: 'Gym' });
  stop();
  const [entry] = await getAll('syncRecords');
  assert.equal(count, 1);
  assert.deepEqual(JSON.parse(entry.value), (await getAll('brands'))[0]);
  const db = await openDb();
  const transaction = db.transaction(['brands', 'syncRecords'], 'readwrite');
  transaction.objectStore('brands').put({ id: 'aborted', name: 'No' });
  transaction.objectStore('syncRecords').put(remote('brands', { id: 'aborted', name: 'No' }));
  const aborted = new Promise((resolve) => { transaction.onabort = resolve; });
  transaction.abort();
  await aborted;
  assert.equal((await getAll('brands')).length, 1);
  assert.equal((await getAll('syncRecords')).length, 1);
});

test('first sync merges local and remote records, and replay is idempotent', async () => {
  await saveRecord('brands', { id: 'local', name: 'My brand' });
  const incoming = [remote('brands', { id: 'remote', name: 'Other phone' })];
  assert.equal(await mergeCloudChanges(incoming, 'account-a'), true);
  assert.equal(await mergeCloudChanges(incoming, 'account-a'), false);
  assert.equal((await getAll('brands')).length, 2);
});

test('a remote response cannot erase an edit made while the bridge request was in flight', async () => {
  await saveRecord('brands', { id: 'b', name: 'Before' });
  const sent = await getAll('syncRecords');
  await saveRecord('brands', { id: 'b', name: 'After' });
  await mergeCloudChanges(sent, 'account-a');
  assert.equal((await getAll('brands'))[0].name, 'After');
});

test('deletions survive old offline data, reseeding and later explicit undo/import', async () => {
  await saveRecord('brands', { id: 'b', name: 'Before' });
  const old = await getAll('syncRecords');
  await deleteById('brands', 'b');
  await mergeCloudChanges(old, 'account-a');
  await seedSyncJournal();
  assert.deepEqual(await getAll('brands'), []);
  assert.equal((await getAll('syncRecords'))[0].deleted, true);
  await saveRecord('brands', { id: 'b', name: 'Restored' });
  assert.equal((await getAll('syncRecords'))[0].deleted, false);
  assert.equal((await getAll('brands'))[0].name, 'Restored');
});

test('new local revisions advance past received clocks, even if the phone clock lags', async () => {
  const incoming = remote('brands', { id: 'b', name: 'Remote' }, Date.now() + 86400000);
  await mergeCloudChanges([incoming], 'account-a');
  await saveRecord('brands', { id: 'b', name: 'Edited here' });
  const [entry] = await getAll('syncRecords');
  assert.equal(compareEnvelopes(entry, incoming), 1);
});

test('foreign-account and malformed batches leave both data and journal unchanged', async () => {
  await saveRecord('brands', { id: 'b', name: 'Private' });
  const before = await getAll('syncRecords');
  const incoming = remote('brands', { id: 'b', name: 'Foreign' });
  await assert.rejects(mergeCloudChanges([incoming], 'account-b'));
  await assert.rejects(mergeCloudChanges([incoming, { ...incoming, version: 2 }], 'account-a'));
  assert.deepEqual(await getAll('syncRecords'), before);
  assert.equal((await getAll('brands'))[0].name, 'Private');
});

test('cascade deletion and undo change only affected records', async () => {
  await bulkPut('brands', [{ id: 'b1', name: 'One' }, { id: 'b2', name: 'Two' }]);
  await saveRecord('machines', { id: 'm', brandId: 'b1', name: 'Press' });
  await saveRecord('sets', { id: 's', machineId: 'm', weight: 50, reps: 8, loggedAt: new Date().toISOString() });
  await loadState();
  const snapshot = await deleteBrandCascade('b1');
  assert.equal(snapshot.brands.length, 1);
  assert.equal((await getAll('syncRecords')).filter((entry) => entry.deleted).length, 3);
  await saveRecord('brands', { id: 'b2', name: 'Changed meanwhile' });
  await restoreSnapshot(snapshot);
  assert.equal(state.brands.find((brand) => brand.id === 'b2').name, 'Changed meanwhile');
  assert.equal(state.sets.length, 1);
});

test('JSON import is an atomic explicit edit and remains exportable without sync metadata', async () => {
  await saveRecord('brands', { id: 'b', name: 'Deleted' });
  await deleteById('brands', 'b');
  const payload = { version: 1, brands: [{ id: 'b', name: 'Imported', updatedAt: '2020-01-01' }] };
  assert.equal(await importDataFile({ text: async () => JSON.stringify(payload) }), 1);
  const result = buildExportPayload();
  assert.equal(result.brands[0].name, 'Imported');
  assert.equal(result.syncRecords, undefined);
  assert.equal((await getAll('syncRecords'))[0].deleted, false);
  await assert.rejects(writeChanges([{ kind: 'brands', id: 42, record: {} }]));
});

test('children arriving before parents are retained for export and appear when parents arrive', async () => {
  await mergeCloudChanges([remote('machines', { id: 'm', brandId: 'b', name: 'Press' })], 'account-a');
  await loadState();
  assert.equal(state.machines.length, 0);
  assert.equal(buildExportPayload().machines.length, 1);
  await mergeCloudChanges([remote('brands', { id: 'b', name: 'Gym' })], 'account-a');
  await loadState();
  assert.equal(state.machines.length, 1);
  assert.equal(buildExportPayload().machines.length, 1);
});
