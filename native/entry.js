import { Capacitor, registerPlugin } from '@capacitor/core';
import { readLegacyDatabase, seedMigrationFixture } from './migration.js';

// Only bundled into the native build. The static PWA needs no npm runtime.
if (Capacitor.isNativePlatform()) {
  const migration = registerPlugin('WorkoutMigration');
  try {
    const { testFixture } = await migration.prepare();
    if (testFixture) await seedMigrationFixture(indexedDB, localStorage);
    await migration.complete({ payload: JSON.stringify(await readLegacyDatabase(indexedDB, localStorage)) });
  } catch { await migration.failed(); }
}
