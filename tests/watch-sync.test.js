import assert from 'node:assert/strict';
import { beforeEach, test } from 'node:test';
import 'fake-indexeddb/auto';
import { deleteById, getAll, mergeWatchChanges, saveRecord, txMulti } from '../js/database.js';
import { ENTITY_STORES, makeEnvelope } from '../js/sync-model.js';
import { buildWatchSnapshot } from '../js/watch-sync.js';

const stores = [...ENTITY_STORES, 'syncRecords', 'syncMeta'];
const set = { id: 'watch-one', machineId: 'm1', weight: 52.5, reps: 8, loggedAt: '2026-10-08T10:00:00.000Z' };
const entry = makeEnvelope('sets', set, '0001700000000000-watch');
beforeEach(async () => {
  await txMulti(stores, 'readwrite', db => stores.forEach(name => db[name].clear()));
});

test('Watch sets merge without iCloud, duplicate delivery creates no duplicate set', async () => {
  assert.equal(await mergeWatchChanges([entry]), true);
  assert.equal(await mergeWatchChanges([entry]), false);
  assert.deepEqual(await getAll('sets'), [set]);
  assert.deepEqual(await getAll('syncRecords'), [entry]);
});

test('an offline Watch replay preserves subsequent iPhone edits and deletions', async () => {
  await mergeWatchChanges([entry]);
  await saveRecord('sets', { ...set, weight: '60', reps: '9', rpe: '' });
  await mergeWatchChanges([entry]);
  assert.equal((await getAll('sets'))[0].weight, '60');
  await deleteById('sets', set.id);
  await mergeWatchChanges([entry]);
  assert.deepEqual(await getAll('sets'), []);
  assert.equal((await getAll('syncRecords'))[0].deleted, true);
});

test('invalid Watch batches fail before writing any set', async () => {
  for (const invalid of [
    makeEnvelope('brands', { id: 'watch-brand', name: 'Gym' }, entry.revision),
    makeEnvelope('sets', { ...set, id: 'phone-one' }, entry.revision),
    makeEnvelope('sets', { ...set, id: 'watch-bad', reps: 1.5 }, entry.revision),
    makeEnvelope('sets', { ...set, id: 'watch-bad', loggedAt: 'bad' }, entry.revision),
  ]) {
    await assert.rejects(mergeWatchChanges([entry, invalid]));
    assert.deepEqual(await getAll('sets'), []);
    assert.deepEqual(await getAll('syncRecords'), []);
  }
});

test('snapshot follows phone brand order, keeps latest values and deletion acknowledgements', () => {
  const tombstone = { ...entry, deleted: true, value: null };
  const snapshot = buildWatchSnapshot(
    [{ id: 'b2', name: 'Beta', sortOrder: 1 }, { id: 'b1', name: 'Zulu', sortOrder: 0 }],
    [{ id: 'm1', brandId: 'b1', name: 'Press' }, { id: 'orphan', brandId: 'gone', name: 'Hidden' }],
    [set, { ...set, id: 'phone-new', weight: '60', reps: '10', rpe: '', loggedAt: '2026-10-08T11:00:00.000Z' }],
    [tombstone, makeEnvelope('brands', { id: 'b1', name: 'Zulu' }, entry.revision)],
  );
  assert.deepEqual(snapshot.brands.map(b => b.id), ['b1', 'b2']);
  assert.deepEqual(snapshot.machines.map(m => m.id), ['m1']);
  assert.equal(snapshot.lastSets[0].id, 'phone-new');
  assert.deepEqual(snapshot.watchRecords, [tombstone]);
});
