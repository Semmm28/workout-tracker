import assert from 'node:assert/strict';
import test from 'node:test';
import { readFile } from 'node:fs/promises';
import vm from 'node:vm';

const serviceWorker = await readFile(new URL('../sw.js', import.meta.url), 'utf8');
const pwa = await readFile(new URL('../js/pwa.js', import.meta.url), 'utf8');

test('service worker activation only removes older workout tracker caches', () => {
  assert.match(serviceWorker, /const CACHE_PREFIX = 'workout-log-shell-'/);
  assert.match(serviceWorker, /const CACHE_NAME = `\$\{CACHE_PREFIX\}v17`/);
  assert.match(
    serviceWorker,
    /\.filter\(\(key\) => key\.startsWith\(CACHE_PREFIX\) && key !== CACHE_NAME\)/,
  );
  assert.doesNotMatch(
    serviceWorker,
    /keys\.filter\(\(key\) => key !== CACHE_NAME\)/,
  );
});

test('manual refresh only unregisters this app and deletes its own caches', () => {
  assert.match(pwa, /serviceWorkerRegistration\.unregister\(\)/);
  assert.doesNotMatch(pwa, /getRegistrations\(\)/);
  assert.match(pwa, /cacheKeys\.filter\(\(key\) => key\.startsWith\(CACHE_PREFIX\)\)/);
  assert.doesNotMatch(pwa, /cacheKeys\.map\(\(key\) => caches\.delete\(key\)\)/);
});

test('offline navigation fallback reads only from the current shell cache', () => {
  assert.match(
    serviceWorker,
    /caches\.open\(CACHE_NAME\)\.then\(\(cache\) => cache\.match\('\.\/index\.html'\)\)/,
  );
  assert.doesNotMatch(serviceWorker, /caches\.match\('\.\/index\.html'\)/);
});

test('activation behavior preserves caches owned by another app', async () => {
  const handlers = {};
  const deleted = [];
  let claimed = false;
  const context = {
    URL,
    location: { origin: 'https://example.test' },
    fetch: async () => ({ clone: () => ({}) }),
    caches: {
      keys: async () => [
        'workout-log-shell-v16',
        'workout-log-shell-v17',
        'other-app-v1',
      ],
      delete: async (key) => {
        deleted.push(key);
        return true;
      },
      open: async () => ({
        addAll: async () => {},
        match: async () => null,
        put: async () => {},
      }),
    },
    self: {
      addEventListener: (type, handler) => {
        handlers[type] = handler;
      },
      skipWaiting: () => {},
      clients: {
        claim: async () => {
          claimed = true;
        },
      },
    },
  };

  vm.runInNewContext(serviceWorker, context);
  let activation;
  handlers.activate({
    waitUntil: (promise) => {
      activation = promise;
    },
  });
  await activation;

  assert.deepEqual(deleted, ['workout-log-shell-v16']);
  assert.equal(claimed, true);
});

test('manual refresh behavior leaves foreign caches and registrations untouched', async () => {
  const originalNavigator = Object.getOwnPropertyDescriptor(globalThis, 'navigator');
  const originalWindow = Object.getOwnPropertyDescriptor(globalThis, 'window');
  const originalCaches = Object.getOwnPropertyDescriptor(globalThis, 'caches');
  const deleted = [];
  let ownUnregisters = 0;
  let foreignUnregisters = 0;
  let allRegistrationReads = 0;
  let replacementUrl = '';

  const ownRegistration = {
    update: async () => {},
    unregister: async () => {
      ownUnregisters += 1;
      return true;
    },
  };
  const foreignRegistration = {
    unregister: async () => {
      foreignUnregisters += 1;
      return true;
    },
  };

  try {
    Object.defineProperty(globalThis, 'navigator', {
      configurable: true,
      value: {
        serviceWorker: {
          register: async () => ownRegistration,
          getRegistrations: async () => {
            allRegistrationReads += 1;
            return [ownRegistration, foreignRegistration];
          },
        },
      },
    });
    Object.defineProperty(globalThis, 'caches', {
      configurable: true,
      value: {
        keys: async () => ['workout-log-shell-v16', 'other-app-v1'],
        delete: async (key) => {
          deleted.push(key);
          return true;
        },
      },
    });
    Object.defineProperty(globalThis, 'window', {
      configurable: true,
      value: {
        caches: globalThis.caches,
        location: {
          href: 'https://example.test/workout/#/settings',
          hash: '#/settings',
          replace: (url) => {
            replacementUrl = url;
          },
        },
      },
    });

    const moduleUrl = new URL('../js/pwa.js?cache-behavior', import.meta.url);
    const { refreshApp, registerServiceWorker } = await import(moduleUrl);
    await registerServiceWorker();
    await refreshApp(() => {});

    assert.equal(ownUnregisters, 1);
    assert.equal(foreignUnregisters, 0);
    assert.equal(allRegistrationReads, 0);
    assert.deepEqual(deleted, ['workout-log-shell-v16']);
    assert.match(replacementUrl, /[?&]refresh=\d+/);
    assert.match(replacementUrl, /#\/settings$/);
  } finally {
    if (originalNavigator) Object.defineProperty(globalThis, 'navigator', originalNavigator);
    else delete globalThis.navigator;
    if (originalWindow) Object.defineProperty(globalThis, 'window', originalWindow);
    else delete globalThis.window;
    if (originalCaches) Object.defineProperty(globalThis, 'caches', originalCaches);
    else delete globalThis.caches;
  }
});
