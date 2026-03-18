// Service Worker — makes the app work offline
// Strategy: network first, fall back to cache
// This means users always get fresh data when online,
// but the app still loads if they lose connection

const CACHE_NAME = 'flowfree-v1';
const STATIC_ASSETS = ['/', '/index.html', '/manifest.json'];

// Install: cache the core assets
self.addEventListener('install', event => {
  event.waitUntil(
    caches.open(CACHE_NAME).then(cache => cache.addAll(STATIC_ASSETS))
  );
  self.skipWaiting(); // activate immediately
});

// Activate: delete old caches from previous versions
self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys().then(keys =>
      Promise.all(keys.filter(k => k !== CACHE_NAME).map(k => caches.delete(k)))
    )
  );
  self.clients.claim(); // take control of all open tabs
});

// Fetch: try network first, fall back to cache
self.addEventListener('fetch', event => {
  if (event.request.method !== 'GET') return; // only cache GET requests
  event.respondWith(
    fetch(event.request)
      .then(res => {
        // Save a copy of the response in cache for offline use
        const clone = res.clone();
        caches.open(CACHE_NAME).then(cache => cache.put(event.request, clone));
        return res;
      })
      .catch(() => caches.match(event.request)) // offline fallback
  );
});