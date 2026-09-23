// Runtime-caching + precaching service worker for the PWA install path.
//
// This app is built with `output: "export"` (next.config.mjs), so build
// filenames are content-hashed and unknown ahead of time - there's no static
// manifest to precache against without adding real build tooling. Instead of
// a Workbox plugin (which would mean a second webpack-mutating config
// wrapper stacked on next.config.mjs's existing withSentryConfig, and would
// replace or restructure this hand-rolled file), a small postbuild script
// (scripts/generate-precache-manifest.ts) writes /precache-manifest.json
// listing every URL in the static export. install() below fetches that and
// caches everything up front, so a device that has NEVER opened this app
// online before can still launch it offline right after installing. Runtime
// caching (below) is unchanged and still covers everything else: the first
// (online) load of any asset not in the manifest (or a later deploy's
// changed assets) populates the cache the same way it always did.
//
// Bump CACHE_VERSION on any change to the caching strategy itself (not on
// every deploy - the strategy below already updates cached assets on every
// successful network fetch); activate() deletes any cache left behind by an
// older version.
const CACHE_VERSION = "dumosrx-v2";

self.addEventListener("install", (event) => {
  event.waitUntil(
    (async () => {
      try {
        const response = await fetch("/precache-manifest.json");
        if (!response.ok) throw new Error(`Manifest fetch failed: ${response.status}`);
        const urls = await response.json();
        const cache = await caches.open(CACHE_VERSION);
        await cache.addAll(urls);
        // Only activate this version once precaching actually succeeded -
        // failing the whole install (by not calling skipWaiting, and letting
        // the thrown error below reject the install promise) keeps whatever
        // service worker was already controlling the page in charge, rather
        // than activating with an empty/partial cache.
        self.skipWaiting();
      } catch (err) {
        // Deliberately does NOT call skipWaiting() here: whatever service
        // worker (if any) was already controlling the page stays in charge
        // rather than this version activating with an empty/partial cache.
        // A missing manifest (e.g. served from a dev server, or an export
        // that predates the postbuild script) or a transient network
        // failure both land here - on the very first install ever (no prior
        // SW to fall back to), this just means the page loads over the
        // network as normal until a later install attempt succeeds, rather
        // than "succeeding" into a false sense of offline-readiness.
        console.error("[SW] Precache failed, install not activated:", err);
      }
    })(),
  );
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
