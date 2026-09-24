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
const CACHE_VERSION = "dumosrx-v3";

self.addEventListener("install", (event) => {
  event.waitUntil(
    (async () => {
      try {
        const response = await fetch("/precache-manifest.json");
        if (!response.ok) throw new Error(`Manifest fetch failed: ${response.status}`);
        const urls = await response.json();
        const cache = await caches.open(CACHE_VERSION);
        // Per-URL rather than cache.addAll(urls): addAll is atomic - one
        // 404 (a file the deploy step didn't upload, a host rule on some
        // path) would silently abort precaching every other URL too.
        // allSettled lets the rest still get cached and only the specific
        // misses get logged.
        const results = await Promise.allSettled(
          urls.map(async (url) => {
            const res = await fetch(url);
            if (!res.ok) throw new Error(`${url}: ${res.status}`);
            await cache.put(url, res);
          }),
        );
        const failed = results.filter((r) => r.status === "rejected");
        if (failed.length > 0) {
          console.error(
            `[SW] Precache: ${failed.length}/${urls.length} URLs failed:`,
            failed.map((r) => r.reason?.message || r.reason),
          );
        }
        // "/" is the last-resort fallback every other offline navigation
        // miss falls back to below - unlike every other URL, its failure
        // can't be tolerated as "most of the app shell still works", since
        // losing it turns every uncached offline route into a hard error
        // instead of at least showing the app shell.
        //
        // Checked against THIS install's own result, not cache.match("/")
        // after the fact: CACHE_VERSION is deliberately not bumped per
        // deploy (see comment above), so a stale "/" left over from a
        // previous successful install would otherwise make this check pass
        // even when the current fetch for "/" just failed, silently
        // activating a worker that (re)serves an old deploy's shell instead
        // of failing loudly as intended.
        const shellIndex = urls.indexOf("/");
        if (shellIndex === -1 || results[shellIndex].status === "rejected") {
          throw new Error('Precache: "/" (the offline shell fallback) failed to cache');
        }
        // Only activate this version once precaching actually ran - failing
        // the whole install (by letting the thrown error below reject the
        // install promise) keeps whatever service worker was already
        // controlling the page in charge, rather than activating with a
        // totally empty cache. A partial precache (some URLs failed above)
        // still activates - most of the app shell being cached beats none
        // of it, and the failures are already logged.
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
        // Rethrown deliberately: an async waitUntil() callback that merely
        // resolves (even after a caught error) tells the browser install
        // succeeded, which calls activate() regardless of skipWaiting() -
        // on a brand-new install (no prior SW to "stay in charge") this
        // would otherwise activate this worker with an empty cache. Only a
        // rejected waitUntil promise actually fails the install.
        throw err;
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

      // Prune entries no longer in the current build's manifest.
      // CACHE_VERSION is deliberately not bumped per deploy (see comment
      // above), so without this, every deploy's newly hashed /_next chunks -
      // plus, before the navigate/RSC cache-key normalization above existed,
      // a full duplicate HTML document per distinct query string ever
      // navigated to - just accumulated in the same cache indefinitely. That
      // kind of unbounded growth is exactly what can exceed an iOS device's
      // per-origin storage quota, and when iOS evicts a quota-exceeding
      // origin it evicts the cache entirely, which is indistinguishable from
      // the service worker never having run at all.
      try {
        const manifestResponse = await fetch("/precache-manifest.json");
        if (manifestResponse.ok) {
          const currentUrls = new Set(await manifestResponse.json());
          const cache = await caches.open(CACHE_VERSION);
          const requests = await cache.keys();
          await Promise.all(
            requests
              .filter((req) => !currentUrls.has(new URL(req.url).pathname))
              .map((req) => cache.delete(req)),
          );
        }
      } catch (err) {
        console.error("[SW] Cache prune failed:", err);
      }

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
  //
  // isHtmlResponse guards every response this branch might cache or return:
  // a navigation must always resolve to a real HTML document. Without this,
  // anything that ever ended up cached under a page's URL with the wrong
  // body - a React Server Component flight payload (the same route's own
  // .txt sibling file, this app's static export writes both - see
  // scripts/generate-precache-manifest.ts), a stale entry left by an older
  // SW version, a response cut short mid-download - would get served
  // straight to the browser as "the page". Since that body isn't HTML, the
  // browser doesn't parse it; it just prints the raw text on screen, which
  // is exactly what happened here: a page restored/launched offline showed
  // its own RSC payload's raw serialized text instead of rendering.
  const isHtmlResponse = (response) =>
    !!response && (response.headers.get("content-type") || "").includes("text/html");

  if (request.mode === "navigate") {
    event.respondWith(
      (async () => {
        const cache = await caches.open(CACHE_VERSION);
        // This static export serves the same document for a route
        // regardless of its query string (out/.htaccess rewrites purely on
        // pathname; query params like "/pos?dispense_rx=12" are read
        // client-side after hydration), so the cache key is normalized to
        // the pathname alone - same fix as the ".txt" RSC payload below.
        // Without this, restoring a backgrounded query-bearing route offline
        // (iOS reloading a suspended tab, a hard refresh) never matched the
        // precached bare-pathname entry and fell back to the "/" shell
        // instead of the actual page, and every distinct query value online
        // would otherwise cache a full duplicate HTML document forever
        // (CACHE_VERSION is intentionally not bumped per deploy).
        const navigateUrl = new URL(request.url);
        const navigateCacheKey = new Request(navigateUrl.origin + navigateUrl.pathname);
        try {
          // iOS Safari can leave a doomed fetch pending for tens of seconds
          // on a dead connection instead of rejecting quickly (unlike
          // Chrome/Android), which otherwise shows a spinner for that whole
          // window before the offline fallback below ever kicks in.
          const controller = new AbortController();
          const timeout = setTimeout(() => controller.abort(), 4000);
          const response = await fetch(request, { signal: controller.signal }).finally(() =>
            clearTimeout(timeout),
          );
          // Deliberately NOT gated on response.ok: a genuine, current 404/
          // 500 HTML error page from the network is still real, current
          // information and must be shown/cached as-is (this matches the
          // pre-existing behavior before the isHtmlResponse guard below was
          // added) - only its body's actual type matters here, not its
          // status code.
          if (isHtmlResponse(response)) {
            await cache.put(navigateCacheKey, response.clone());
            return response;
          }
          // A non-HTML network response for a navigation (an RSC flight
          // payload landing here instead of at its own .txt URL, a
          // misrouted request, ...) is never trustworthy enough to show the
          // user or to cache - fall through to the offline cache path below
          // instead of returning it.
          throw new Error(`Unexpected navigate response content-type: ${response.headers.get("content-type")}`);
        } catch {
          const cached = await cache.match(navigateCacheKey);
          if (isHtmlResponse(cached)) return cached;
          const shell = await cache.match("/");
          if (isHtmlResponse(shell)) return shell;
          return Response.error();
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
  //
  // Next's RSC payload requests (the ".txt" sibling of every route, fetched
  // on client-side navigation) append a "?_rsc=<hash>" query string that
  // encodes the route being navigated FROM, so it changes on every
  // navigation and never matches what generate-precache-manifest.ts wrote
  // the file under (its bare pathname, no query). The payload itself is
  // static per route in this export regardless of that hash, so the query is
  // stripped for both the cache lookup and the cache write - otherwise every
  // offline soft-navigation missed the precached ".txt" entirely and Next
  // silently fell back to a full page reload.
  const requestUrl = new URL(request.url);
  const cacheKey = requestUrl.pathname.endsWith(".txt")
    ? new Request(requestUrl.origin + requestUrl.pathname)
    : request;

  event.respondWith(
    (async () => {
      const cache = await caches.open(CACHE_VERSION);
      const cached = await cache.match(cacheKey);

      const networkFetch = (async () => {
        try {
          const response = await fetch(request);
          // Only cache real, successful, non-opaque responses.
          if (response.ok) await cache.put(cacheKey, response.clone());
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
