import { VERSION } from './version';

/**
 * Offline / installable support. The service worker (sw/sw.js) precaches each release.
 *
 * Updates: on launch, when the app comes back to the foreground, and hourly, the browser checks
 * sw.js. A new release downloads in the background and waits. `onUpdateReady` then hands the app
 * an `apply()` that switches to the new version and reloads (the track and settings are in
 * localStorage, so nothing is lost). If it's never applied, the new version takes over the next
 * time the app is fully closed and reopened.
 */
export function registerServiceWorker(onUpdateReady: (apply: () => void) => void) {
  if (!import.meta.env.PROD || typeof navigator === 'undefined' || !('serviceWorker' in navigator)) return;
  let applying = false;
  navigator.serviceWorker.addEventListener('controllerchange', () => {
    if (applying) location.reload();
  });

  const offer = (w: ServiceWorker) =>
    onUpdateReady(() => {
      applying = true;
      w.postMessage({ type: 'SKIP_WAITING' });
    });

  navigator.serviceWorker
    .register('./sw.js')
    .then((reg) => {
      // Only offer an update when an older version is already running this page.
      if (reg.waiting && navigator.serviceWorker.controller) offer(reg.waiting);
      reg.addEventListener('updatefound', () => {
        const w = reg.installing;
        w?.addEventListener('statechange', () => {
          if (w.state === 'installed' && navigator.serviceWorker.controller) offer(w);
        });
      });
      const check = () => void reg.update().catch(() => {});
      document.addEventListener('visibilitychange', () => {
        if (!document.hidden) check();
      });
      setInterval(check, 60 * 60 * 1000);
    })
    .catch((err) => console.warn('[glowfall] service worker unavailable', err));
}

const SEEN_KEY = 'glowfall.version';

/** The version this device ran last time, if it differs from now (i.e. we just updated). */
export function justUpdatedFrom(): string | null {
  try {
    const prev = localStorage.getItem(SEEN_KEY);
    localStorage.setItem(SEEN_KEY, VERSION);
    return prev && prev !== VERSION ? prev : null;
  } catch {
    return null;
  }
}
