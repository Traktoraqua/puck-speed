// Network-first service worker. Online always gets fresh code (no stale-cache
// trap); offline falls back to the runtime cache. Paths are derived from the
// registration scope, so it works under any deploy path (root or /puck-speed/).
const CACHE = 'puck-speed-v2';
const BASE = new URL('./', self.registration.scope).href;
const PRECACHE = ['', 'index.html', 'manifest.webmanifest', 'onset-worklet.js'].map(
  (p) => new URL(p, BASE).href
);

self.addEventListener('install', (e) => {
  e.waitUntil(caches.open(CACHE).then((c) => c.addAll(PRECACHE)).catch(() => {}));
  self.skipWaiting();
});

self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches.keys().then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
  );
  self.clients.claim();
});

self.addEventListener('fetch', (e) => {
  if (e.request.method !== 'GET') return;
  e.respondWith(
    fetch(e.request)
      .then((res) => {
        const copy = res.clone();
        caches.open(CACHE).then((c) => c.put(e.request, copy)).catch(() => {});
        return res;
      })
      .catch(() =>
        caches.match(e.request).then(
          (hit) => hit || (e.request.mode === 'navigate' ? caches.match(new URL('index.html', BASE).href) : undefined)
        )
      )
  );
});
