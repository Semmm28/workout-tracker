let serviceWorkerRegistration = null;
let isRefreshingApp = false;

export function setupServiceWorkerAutoRefresh() {
  if (!('serviceWorker' in navigator)) return;
  navigator.serviceWorker.addEventListener('controllerchange', () => {
    if (isRefreshingApp) return;
    isRefreshingApp = true;
    window.location.reload();
  });
}

export async function refreshApp(showToast) {
  if (isRefreshingApp) return;

  try {
    showToast('Refreshing app…');

    if ('serviceWorker' in navigator) {
      const registrations = await navigator.serviceWorker.getRegistrations();
      await Promise.all(registrations.map((registration) => registration.unregister()));
      serviceWorkerRegistration = null;
    }

    if ('caches' in window) {
      const cacheKeys = await caches.keys();
      await Promise.all(cacheKeys.map((key) => caches.delete(key)));
    }

    const url = new URL(window.location.href);
    const hash = window.location.hash;
    url.searchParams.set('refresh', `${Date.now()}`);
    url.hash = hash;

    isRefreshingApp = true;
    window.location.replace(url.toString());
  } catch (error) {
    console.warn('App refresh failed:', error);
    showToast('Refresh failed');
  }
}

export async function registerServiceWorker() {
  if (!('serviceWorker' in navigator)) return;
  try {
    serviceWorkerRegistration = await navigator.serviceWorker.register('./sw.js');
    await serviceWorkerRegistration.update();
  } catch (error) {
    console.warn('Service worker registration failed:', error);
  }
}
