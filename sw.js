/* Glowfall service worker. Built into docs/sw.js by the `glowfall-sw` plugin in vite.config.ts,
 * which fills in the version and the precache list. Each release gets its own cache. */
const VERSION = "1.3.3-6ebd7a2";
const FILES = ["apple-touch-icon.png","assets/app-Co2wM-Go.js","assets/app-ENRJXa2h.css","assets/apple-touch-icon-Cjgun8O3.png","assets/icon-CoLxm2Mw.svg","assets/manifest-CZ2uhA_x.webmanifest","icon-192.png","icon-512.png","icon.svg","index.html","manifest.webmanifest"];
const CACHE = 'glowfall-' + VERSION;
const scoped = (f) => new URL(f, self.registration.scope).href;

self.addEventListener('install', (event) => {
  // Download the whole new version in the background. It then waits until the app says
  // "update" (or every Glowfall window is closed), so a run is never swapped out mid-flight.
  event.waitUntil(
    caches.open(CACHE).then((c) => c.addAll(FILES.map((f) => new Request(scoped(f), { cache: 'reload' })))),
  );
});

self.addEventListener('message', (event) => {
  if (event.data && event.data.type === 'SKIP_WAITING') self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) => Promise.all(keys.filter((k) => k.startsWith('glowfall-') && k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim()),
  );
});

self.addEventListener('fetch', (event) => {
  const req = event.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  if (url.origin !== self.location.origin || !url.href.startsWith(self.registration.scope)) return;

  if (req.mode === 'navigate') {
    // The app shell always comes from this version's cache, so it matches its assets.
    event.respondWith(
      caches.open(CACHE).then((c) => c.match(scoped('index.html')).then((hit) => hit || fetch(req))),
    );
    return;
  }
  event.respondWith(
    caches.open(CACHE).then((c) => c.match(req, { ignoreSearch: true }).then((hit) => hit || fetch(req))),
  );
});
