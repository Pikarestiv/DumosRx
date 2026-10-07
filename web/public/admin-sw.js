/*
 * Admin panel service worker.
 *
 * Its ONLY job is to make the panel installable and to keep the app shell
 * loading on a flaky connection. It deliberately does NOT cache API
 * responses: every screen here reports live platform state — sync health,
 * revenue, what is stuck — and showing a stale number to an operator who is
 * about to act on it is worse than showing them nothing. Anything under
 * /api/ is network-only, always.
 */
const SHELL_CACHE = "dumosrx-admin-shell-v1";

const SHELL_ASSETS = [
  "/admin/",
  "/favicon.ico",
  "/web-app-manifest-192x192.png",
  "/web-app-manifest-512x512.png",
];

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches
      .open(SHELL_CACHE)
      .then((cache) => cache.addAll(SHELL_ASSETS))
      .catch(() => undefined)
      .then(() => self.skipWaiting()),
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) =>
        Promise.all(keys.filter((key) => key !== SHELL_CACHE).map((key) => caches.delete(key))),
      )
      .then(() => self.clients.claim()),
  );
});

self.addEventListener("fetch", (event) => {
  const request = event.request;

  if (request.method !== "GET") {
    return;
  }

  const url = new URL(request.url);

  // Never serve platform data from a cache, and never store it.
  if (url.pathname.includes("/api/") || url.origin !== self.location.origin) {
    return;
  }

  // Static build output is content-hashed, so a cache hit is always correct.
  if (url.pathname.startsWith("/_next/static/")) {
    event.respondWith(
      caches.match(request).then((hit) => hit || fetchAndCache(request)),
    );
    return;
  }

  // Navigations: network first, cached shell only as a fallback so the app
  // opens rather than showing a browser error page.
  if (request.mode === "navigate") {
    event.respondWith(
      fetch(request).catch(() => caches.match("/admin/").then((hit) => hit || Response.error())),
    );
  }
});

function fetchAndCache(request) {
  return fetch(request).then((response) => {
    if (response && response.ok) {
      const copy = response.clone();
      caches.open(SHELL_CACHE).then((cache) => cache.put(request, copy));
    }

    return response;
  });
}
