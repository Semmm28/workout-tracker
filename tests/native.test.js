import assert from 'node:assert/strict';
import test from 'node:test';
import { createNativeExporter } from '../native/export.js';
import { renderSettingsScreen } from '../js/screens/settings.js';

test('native JSON export writes a backup and shares the resulting local file', async () => {
  const calls = [];
  const exportJson = createNativeExporter({
    Filesystem: { writeFile: async (options) => { calls.push(['write', options]); return { uri: 'file:///cache/backup.json' }; } },
    Share: { share: async (options) => { calls.push(['share', options]); } },
    Directory: { Cache: 'CACHE' },
    Encoding: { UTF8: 'utf8' },
  });
  const payload = { version: 1, sets: [{ weight: 80, reps: 8 }] };
  await exportJson('backup.json', payload);
  assert.equal(calls[0][0], 'write');
  assert.deepEqual(JSON.parse(calls[0][1].data), payload);
  assert.equal(calls[0][1].directory, 'CACHE');
  assert.deepEqual(calls[1][1].files, ['file:///cache/backup.json']);
  await assert.rejects(exportJson('../backup.json', payload), /Invalid backup filename/);
});

test('native export does not open the share sheet when writing fails', async () => {
  let shared = false;
  const exportJson = createNativeExporter({
    Filesystem: { writeFile: async () => { throw new Error('Disk full'); } },
    Share: { share: async () => { shared = true; } },
    Directory: { Cache: 'CACHE' },
    Encoding: { UTF8: 'utf8' },
  });
  await assert.rejects(exportJson('backup.json', {}), /Disk full/);
  assert.equal(shared, false);
});

test('native runtime skips service workers, caches and browser refresh', async () => {
  const original = globalThis.Capacitor;
  try {
    globalThis.Capacitor = { isNativePlatform: () => true };
    const { registerServiceWorker, setupServiceWorkerAutoRefresh, refreshApp } = await import('../js/pwa.js?native');
    // No window or navigator mocks: these operations must return before web APIs.
    setupServiceWorkerAutoRefresh();
    await registerServiceWorker();
    let message;
    await refreshApp((value) => { message = value; });
    assert.match(message, /TestFlight/);
    assert.doesNotMatch(renderSettingsScreen(), /data-action="refresh-app"/);
    globalThis.Capacitor = { isNativePlatform: () => false };
    assert.match(renderSettingsScreen(), /data-action="refresh-app"/);
  } finally {
    if (original === undefined) delete globalThis.Capacitor;
    else globalThis.Capacitor = original;
  }
});
