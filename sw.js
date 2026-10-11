/* Apodict service worker
 * Caches ONLY the static app shell so the app opens fast (even while the server wakes up).
 * It never touches /api, Firebase auth handlers, Firestore, or any other site.
 * Bump VERSION to force every installed copy to drop its old caches.
 */
const VERSION = 'v1';
const SHELL_CACHE = `apodict-shell-${VERSION}`;
const ASSET_CACHE = `apodict-assets-${VERSION}`;
const SHELL_URLS = ['/', '/manifest.webmanifest', '/icons/icon-192.png', '/icons/icon-512.png'];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches
      .open(SHELL_CACHE)
      .then((cache) => cache.addAll(SHELL_URLS))
      .catch(() => {})
      .then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) =>
        Promise.all(
          keys
            .filter((k) => k.startsWith('apodict-') && k !== SHELL_CACHE && k !== ASSET_CACHE)
            .map((k) => caches.delete(k))
        )
      )
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (event) => {
  const req = event.request;
  if (req.method !== 'GET') return;

  const url = new URL(req.url);

  // Never intercept other origins (Firebase, Google APIs, fonts, etc.)
  if (url.origin !== self.location.origin) return;

  // Never intercept API calls or Firebase auth helper paths
  if (url.pathname.startsWith('/api') || url.pathname.startsWith('/__/')) return;

  // Page loads: network first (always the newest version), cached shell as the offline fallback.
  // Every page route serves the same index.html, so one cached copy under "/" is enough.
  if (req.mode === 'navigate') {
    event.respondWith(
      fetch(req)
        .then((res) => {
          if (res.ok && res.type === 'basic') {
            const copy = res.clone();
            caches.open(SHELL_CACHE).then((cache) => cache.put('/', copy));
          }
          return res;
        })
        .catch(() => caches.match('/').then((cached) => cached || Response.error()))
    );
    return;
  }

  // Built JS/CSS (hashed file names never change) and icons: cache first
  if (url.pathname.startsWith('/assets/') || url.pathname.startsWith('/icons/')) {
    event.respondWith(
      caches.match(req).then(
        (cached) =>
          cached ||
          fetch(req).then((res) => {
            if (res.ok && res.type === 'basic') {
              const copy = res.clone();
              caches.open(ASSET_CACHE).then((cache) => cache.put(req, copy));
            }
            return res;
          })
      )
    );
  }
  // Anything else goes straight to the network
});