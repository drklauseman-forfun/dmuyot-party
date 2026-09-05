/*
 * Service worker.
 *
 * Its job is to make the installed app open instantly and survive a bad
 * connection — not to make the app work offline, which it cannot: loading a
 * character list needs the backend. Offline you get the interface and a clear
 * "couldn't reach the server" message instead of a dead tab.
 *
 * Bump CACHE_VERSION when the caching strategy changes. Build output is
 * content-hashed, so new files get new URLs and old ones age out with the
 * cache; the version only needs bumping for changes to this file's logic.
 */

const CACHE_VERSION = 'v1';
const CACHE_NAME = `dmuyot-${CACHE_VERSION}`;

/** Enough to render the shell on a cold, offline start. */
const SHELL = [
  '/',
  '/index.html',
  '/manifest.webmanifest',
  '/icon-192.png',
  '/icon-512.png',
  '/apple-touch-icon.png',
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches
      .open(CACHE_NAME)
      // Individually, so one missing file cannot fail the whole install.
      .then((cache) => Promise.all(SHELL.map((url) => cache.add(url).catch(() => undefined))))
      .then(() => self.skipWaiting()),
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== CACHE_NAME).map((k) => caches.delete(k))))
      .then(() => self.clients.claim()),
  );
});

self.addEventListener('fetch', (event) => {
  const { request } = event;

  // Only GET is cacheable, and the API is a POST anyway. Anything else, and
  // anything cross-origin, goes straight to the network untouched — the
  // backend's answers must never be served from a cache.
  if (request.method !== 'GET') return;

  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return;

  // Navigations are network-first so a new deploy is picked up on the next
  // launch, with the cached shell as the offline fallback.
  if (request.mode === 'navigate') {
    event.respondWith(
      fetch(request)
        .then((response) => {
          const copy = response.clone();
          caches.open(CACHE_NAME).then((cache) => cache.put('/index.html', copy));
          return response;
        })
        .catch(() => caches.match('/index.html').then((hit) => hit ?? Response.error())),
    );
    return;
  }

  // Everything else — hashed bundles, icons, the sound files — is immutable at
  // its URL, so serve from cache and fill the cache on first miss.
  event.respondWith(
    caches.match(request).then((hit) => {
      if (hit) return hit;
      return fetch(request).then((response) => {
        if (response.ok && response.type === 'basic') {
          const copy = response.clone();
          caches.open(CACHE_NAME).then((cache) => cache.put(request, copy));
        }
        return response;
      });
    }),
  );
});
