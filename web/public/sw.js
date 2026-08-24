// Basic service worker to enable PWA installation prompt
self.addEventListener('install', (_event) => {
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(self.clients.claim());
});

self.addEventListener('fetch', (_event) => {
  // Let the browser handle fetches normally — this dashboard is API-driven,
  // so we don't cache anything here. We just need a registered fetch handler
  // to qualify as an installable PWA.
});
