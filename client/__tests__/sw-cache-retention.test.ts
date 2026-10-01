import { describe, it, expect, beforeAll } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

/**
 * P3-2: activate()'s prune used to delete every cache entry missing from the
 * current build's manifest, so an already-open tab running the previous
 * build's JS could lazy-load a chunk that both the prune and the deploy had
 * already removed and get a 404 (or, on this static-export host, an HTML
 * fallback document it then tried to execute). The prune now keeps the
 * immediately-previous build's hashed chunks for exactly one more deploy
 * cycle. This exercises that policy function directly - public/sw.js is a
 * standalone script, so it is evaluated here against a stub `self` and the
 * policy read off the internals it exposes for this purpose.
 */
describe("service worker cache prune retention policy", () => {
  let computeCachePrunePlan: (
    cachedPathnames: string[],
    currentUrls: string[],
    previouslyRetained: string[],
  ) => { deleted: string[]; retained: string[] };
  let RETAINED_RECORD_KEY: string;

  beforeAll(() => {
    const source = readFileSync(
      resolve(__dirname, "../public/sw.js"),
      "utf8",
    );
    const stubSelf = {
      addEventListener: () => {},
      skipWaiting: () => {},
      clients: { claim: () => {} },
      location: { origin: "https://app.dumosrx.test" },
    } as Record<string, unknown>;
    // eslint-disable-next-line @typescript-eslint/no-implied-eval
    const internals = new Function(
      "self",
      `${source}\nreturn self.__swInternals;`,
    )(stubSelf) as {
      computeCachePrunePlan: typeof computeCachePrunePlan;
      RETAINED_RECORD_KEY: string;
    };
    computeCachePrunePlan = internals.computeCachePrunePlan;
    RETAINED_RECORD_KEY = internals.RETAINED_RECORD_KEY;
  });

  const CURRENT = ["/", "/dashboard", "/_next/static/chunks/app-new.js"];

  it("keeps everything the current build's manifest lists", () => {
    const plan = computeCachePrunePlan(CURRENT, CURRENT, []);
    expect(plan.deleted).toEqual([]);
    expect(plan.retained).toEqual([]);
  });

  it("retains the previous build's hashed chunks instead of deleting them", () => {
    const plan = computeCachePrunePlan(
      [...CURRENT, "/_next/static/chunks/app-old.js", "/_next/static/css/old.css"],
      CURRENT,
      [],
    );

    expect(plan.deleted).toEqual([]);
    expect(plan.retained.sort()).toEqual([
      "/_next/static/chunks/app-old.js",
      "/_next/static/css/old.css",
    ]);
  });

  it("deletes a chunk already retained once, so retention is two generations deep and self-pruning", () => {
    const plan = computeCachePrunePlan(
      [...CURRENT, "/_next/static/chunks/app-old.js", "/_next/static/chunks/app-older.js"],
      CURRENT,
      ["/_next/static/chunks/app-older.js"],
    );

    expect(plan.deleted).toEqual(["/_next/static/chunks/app-older.js"]);
    expect(plan.retained).toEqual(["/_next/static/chunks/app-old.js"]);
  });

  it("never retains a stale HTML document or any non-chunk asset", () => {
    const plan = computeCachePrunePlan(
      [...CURRENT, "/retired-page", "/old-icon.png", "/_next/static/media/font.woff2"],
      CURRENT,
      [],
    );

    expect(plan.deleted.sort()).toEqual([
      "/_next/static/media/font.woff2",
      "/old-icon.png",
      "/retired-page",
    ]);
    expect(plan.retained).toEqual([]);
  });

  it("never prunes or retains its own bookkeeping record", () => {
    const plan = computeCachePrunePlan([...CURRENT, RETAINED_RECORD_KEY], CURRENT, []);

    expect(plan.deleted).toEqual([]);
    expect(plan.retained).toEqual([]);
  });

  it("reports a pathname once even when the cache holds several requests for it", () => {
    const plan = computeCachePrunePlan(
      ["/retired-page", "/retired-page", "/_next/static/chunks/a.js", "/_next/static/chunks/a.js"],
      CURRENT,
      [],
    );

    expect(plan.deleted).toEqual(["/retired-page"]);
    expect(plan.retained).toEqual(["/_next/static/chunks/a.js"]);
  });

  it("empties the retention record once the previous build's chunks are gone", () => {
    const plan = computeCachePrunePlan(CURRENT, CURRENT, [
      "/_next/static/chunks/app-older.js",
    ]);

    expect(plan.retained).toEqual([]);
  });
});
