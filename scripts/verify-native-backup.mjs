import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { sanitizeImportData } from '../js/data-transfer.js';
const original = JSON.parse(await readFile('tests/fixtures/pwa-backup-v1.json','utf8'));
const native = JSON.parse(await readFile('build/native-backup.json','utf8'));
const restored = sanitizeImportData(native);
for (const kind of ['brands','machines','sets','bodyweights']) {
  assert.equal(restored[kind].length, original[kind].length, kind);
  for (const record of original[kind]) {
    const actual = restored[kind].find(row => row.id === record.id);
    for (const [key,value] of Object.entries(record)) assert.deepEqual(actual[key],value, `${kind}:${record.id}.${key}`);
  }
}
console.log('Swift export is accepted by the PWA importer with all fields and IDs preserved.');
