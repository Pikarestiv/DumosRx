/*
 * Admin panel service worker — deliberately network-only.
 *
 * An earlier version cached the app shell and /_next/static/. Review showed
 * that was unsafe on this host: it serves index.html with 200 OK for any
 * path it does not have (docs/FIXED_BUGS.md, and client/lib/utils/
 * chunk-error.ts), and the FTP deploy deletes old hashed chunks. A
 * cache-first worker would therefore store an HTML document under a chunk
 * URL after any deploy and serve it forever — a sticky
 * "Unexpected token '<'" that a reload cannot clear, which is the exact bug
 * A-171 was about. web/ has no chunk-error recovery.
 *
 * Caching bought nothing here anyway: every screen reports live platform
 * state, so there is no useful offline mode to build. This worker exists
 * only to make the panel installable.
 */
self.addEventListener("install", () => self.skipWaiting());

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) =>
        Promise.all(
          keys.filter((key) => key.startsWith("dumosrx-admin-")).map((key) => caches.delete(key)),
        ),
      )
      .then(() => self.clients.claim()),
  );
});

// Present so the panel is installable; passes everything through untouched.
self.addEventListener("fetch", () => {});
