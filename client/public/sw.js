// Runtime-caching service worker for the PWA install path.
//
// This app is built with `output: "export"` (next.config.mjs), so build
// filenames are content-hashed and unknown ahead of time - there's no static
// manifest to precache against without adding real build tooling (next-pwa /
// Workbox's injectManifest). Instead this caches same-origin GET requests as
// they're actually made: the first (online) load of any asset populates the
// cache, and every load after that - including fully offline - can be served
// from it. This replaces the previous no-op stub, which only registered a
// fetch handler to satisfy the browser's "installable" check and cached
// nothing at all.
//
// Bump CACHE_VERSION on any change to the caching strategy itself (not on
// every deploy - the strategy below already updates cached assets on every
// successful network fetch); activate() deletes any cache left behind by an
// older version.
const CACHE_VERSION = "dumosrx-v1";

self.addEventListener("install", () => {
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    (async () => {
      const cacheNames = await caches.keys();
      await Promise.all(
        cacheNames
          .filter((name) => name !== CACHE_VERSION)
          .map((name) => caches.delete(name)),
      );
      await self.clients.claim();
    })(),
  );
});

self.addEventListener("fetch", (event) => {
  const { request } = event;

  // Only GET requests are cacheable; a mutating request (POST/PUT/etc, e.g.
  // every API write) must always hit the network.
  if (request.method !== "GET") return;

  // Leave cross-origin requests alone entirely - this covers the API server
  // (a separate domain, e.g. api.dumosrx.com), analytics, fonts, etc. Only
  // this app's own same-origin static assets and pages get cached.
  if (!request.url.startsWith(self.location.origin)) return;

  // A navigation (address-bar load, refresh, or link click into a new
  // document) tries the network first so a page never goes visibly stale,
  // but falls back to the cache - and finally to a cached "/" shell - if the
  // network is unavailable, instead of the browser's offline error page.
  if (request.mode === "navigate") {
    event.respondWith(
      (async () => {
        try {
          const response = await fetch(request);
          const cache = await caches.open(CACHE_VERSION);
          await cache.put(request, response.clone());
          return response;
        } catch {
          const cache = await caches.open(CACHE_VERSION);
          return (
            (await cache.match(request)) ||
            (await cache.match("/")) ||
            Response.error()
          );
        }
      })(),
    );
    return;
  }

  // Everything else same-origin (JS/CSS chunks, the sql.js wasm binary,
  // manifest, icons): stale-while-revalidate. Serve the cached copy
  // immediately when there is one - these are all content-hashed or
  // effectively static, so a cached copy is never wrong - while updating the
  // cache from the network in the background for next time. Falls through to
  // the network directly on a cold cache.
  event.respondWith(
    (async () => {
      const cache = await caches.open(CACHE_VERSION);
      const cached = await cache.match(request);

      const networkFetch = (async () => {
        try {
          const response = await fetch(request);
          // Only cache real, successful, non-opaque responses.
          if (response.ok) await cache.put(request, response.clone());
          return response;
        } catch {
          return undefined;
        }
      })();

      if (cached) {
        // Extends the worker's lifetime past this handler returning, so the
        // background cache update below isn't cut off once the (already
        // resolved) cached response has been sent back.
        event.waitUntil(networkFetch);
        return cached;
      }

      return (await networkFetch) || Response.error();
    })(),
  );
});
