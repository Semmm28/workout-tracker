import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { sanitizeImportData } from '../js/data-transfer.js';
const input=JSON.parse(await readFile('tests/fixtures/training-backup-v2.json','utf8'));
const output=JSON.parse(await readFile('build/native-training-backup.json','utf8'));
const restored=sanitizeImportData(output);
for(const kind of ['brands','machines','sets','bodyweights','plans','sessions'])for(const record of input[kind]){
  const actual=restored[kind].find(r=>r.id===record.id);
  for(const [key,value] of Object.entries(record))assert.deepEqual(actual[key],value,`${kind}:${record.id}.${key}`);
}
assert.equal(restored.sessions.length,2);
assert.equal(restored.sets.filter(s=>s.sessionId).length,1);
console.log('PWA → Swift → PWA retains schemas, active sessions, set IDs and unknown fields.');
