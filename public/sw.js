// 服务工作线程 / Service worker — gives the H5 app an installable, app-like
// shell with offline support. Strategy: network-first for same-origin GETs
// (so deploys appear immediately when online) with a cache fallback for
// offline; cross-origin requests (e.g. Wikimedia images) pass through.

const CACHE = 'fossilia-v2';

// Always-present shell files. Logic modules (store/analytics/data) only exist
// in the static build, so they are cached at runtime rather than precached
// (and each add is best-effort so install never fails on the Node server).
const SHELL = [
  './',
  './index.html',
  './install.html',
  './m.styles.css',
  './m.app.js',
  './charts.js',
  './api.js',
  './icon.svg',
  './manifest.webmanifest',
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE).then((cache) =>
      Promise.all(SHELL.map((u) => cache.add(u).catch(() => {})))
    ).then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (event) => {
  const req = event.request;
  if (req.method !== 'GET') return;

  const url = new URL(req.url);
  // cross-origin (images, etc.) → let the browser handle it
  if (url.origin !== self.location.origin) return;
  // never cache the dynamic API
  if (url.pathname.includes('/api/')) return;

  event.respondWith(
    fetch(req)
      .then((res) => {
        if (res && res.ok) {
          const copy = res.clone();
          caches.open(CACHE).then((c) => c.put(req, copy));
        }
        return res;
      })
      .catch(async () => {
        const cached = await caches.match(req);
        if (cached) return cached;
        if (req.mode === 'navigate') {
          return (await caches.match('./index.html')) || (await caches.match('./')) || Response.error();
        }
        return Response.error();
      })
  );
});
