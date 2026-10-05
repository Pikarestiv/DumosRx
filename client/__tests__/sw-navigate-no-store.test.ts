import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

/**
 * A-158 follow-up: sw.js's navigate handler is documented as "network
 * first" specifically so a page never goes visibly stale, but its fetch()
 * call for the navigation request itself carried no cache option - unlike
 * fetchManifest() a few lines above it, which deliberately passes
 * `cache: "no-store"` to avoid the browser's own HTTP cache quietly
 * answering from a stale previous deploy. Without the same guard on the
 * navigate fetch, a "network first" request could still be satisfied by
 * the browser's heuristic HTTP cache instead of actually reaching the
 * server - reproducible live: one real device got stuck replaying a single
 * stale release 178 times (Sentry DUMOSRX-CLIENT-F) because its own
 * auto-reload-on-stale-chunk recovery (see chunk-error.ts) kept landing
 * back on the same cached document instead of a fresh one.
 */
describe("sw.js navigate fetch bypasses the HTTP cache", () => {
  it("passes cache: \"no-store\" on the navigation request's own fetch, not just the manifest fetch", () => {
    const source = readFileSync(resolve(__dirname, "../public/sw.js"), "utf8");

    // The navigate branch's own request fetch - distinct from the runtime
    // stale-while-revalidate branch's plain `fetch(request)` further down,
    // which deliberately has no cache option (those assets are
    // content-hashed and immutable, so a browser-cache hit is never wrong).
    const fetchCallMatch = source.match(/fetch\(request, \{[^}]*\}\)/);
    expect(fetchCallMatch).not.toBeNull();
    expect(fetchCallMatch![0]).toMatch(/cache:\s*"no-store"/);
  });
});
