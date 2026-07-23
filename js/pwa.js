let serviceWorkerRegistration = null;
let isRefreshingApp = false;

export function setupVisualViewportTracking() {
  const root = document.documentElement;
  const viewport = window.visualViewport;

  const updateViewportVariables = () => {
    const height = viewport?.height || window.innerHeight;
    const offsetTop = viewport?.offsetTop || 0;
    root.style.setProperty('--visual-viewport-height', `${Math.round(height)}px`);
    root.style.setProperty('--visual-viewport-offset-top', `${Math.round(offsetTop)}px`);
  };

  updateViewportVariables();
  window.addEventListener('resize', updateViewportVariables, { passive: true });
  window.addEventListener('orientationchange', updateViewportVariables, { passive: true });
  viewport?.addEventListener('resize', updateViewportVariables, { passive: true });
  viewport?.addEventListener('scroll', updateViewportVariables, { passive: true });
}

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
