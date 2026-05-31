// Basic service worker to enable PWA installation prompt
self.addEventListener('install', (event) => {
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(self.clients.claim());
});

self.addEventListener('fetch', (event) => {
  // Let the browser handle fetches normally.
  // The app uses SQLite WASM locally, which is cached via the browser's HTTP cache.
  // We just need a registered fetch handler to qualify as an installable PWA.
});
