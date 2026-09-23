import { Capacitor, registerPlugin } from '@capacitor/core';
import { Directory, Encoding, Filesystem } from '@capacitor/filesystem';
import { Share } from '@capacitor/share';
import { createNativeExporter } from './export.js';

// Only bundled into the native build. The static PWA needs no npm runtime.
if (Capacitor.isNativePlatform()) {
  globalThis.workoutNative = {
    exportJson: createNativeExporter({ Filesystem, Share, Directory, Encoding }),
    cloud: registerPlugin('WorkoutCloud'),
  };
}

await import('../app.js');
