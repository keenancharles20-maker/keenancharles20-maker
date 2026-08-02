// Red Forest FX Service Worker v3
const CACHE_NAME = 'rfx-v3';
const ASSETS = [
  './',
  './index.html',
  './rfx_boosters.js',
  './rfx_boosters.css',
  './manifest.json'
];

// Install — cache core assets
self.addEventListener('install', function(event) {
  event.waitUntil(
    caches.open(CACHE_NAME).then(function(cache) {
      return cache.addAll(ASSETS).catch(function() {});
    })
  );
  self.skipWaiting();
});

// Activate — clean old caches
self.addEventListener('activate', function(event) {
  event.waitUntil(
    caches.keys().then(function(names) {
      return Promise.all(
        names.filter(function(n) { return n !== CACHE_NAME; }).map(function(n) { return caches.delete(n); })
      );
    })
  );
  self.clients.claim();
});

// Fetch — network first, fallback to cache
self.addEventListener('fetch', function(event) {
  var url = event.request.url;
  // Skip non-GET, OANDA API, and streaming requests
  if (event.request.method !== 'GET') return;
  if (url.includes('oanda.com') || url.includes('openrouter') || url.includes('forexfactory')
      || url.includes('workers.dev') || url.includes('stream-') || url.includes('googleapis')) return;

  event.respondWith(
    fetch(event.request).then(function(res) {
      // Update cache with fresh copy
      var clone = res.clone();
      caches.open(CACHE_NAME).then(function(cache) {
        cache.put(event.request, clone);
      });
      return res;
    }).catch(function() {
      // Offline — serve from cache
      return caches.match(event.request).then(function(cached) {
        return cached || caches.match('./index.html');
      });
    })
  );
});
