import { describe, it, expect } from "vitest";
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";

/**
 * A-304. A sync run used to resolve its store twice — `client.ts` stamped
 * `X-Store-Id` from localStorage at request time while each report builder
 * read the module resolver at the start of the run — so a store switch
 * mid-run could file one store's digest against the other store's cloud. One
 * device did exactly that on 2026-10-19 and the panel reported -4,129 units
 * on a device that was in step.
 *
 * The fix is one identity per run. This test is what keeps it that way: a
 * future call site that reaches for the ambient store instead of taking it
 * from the run fails here, which a code review would not reliably catch.
 */
const ENGINE_DIR = join(__dirname, "..", "lib", "db", "sync-engine");

/**
 * What this guard covers: every file in a RUN's request-and-report path. The
 * exemptions below are not oversights — each resolves the store and uses it
 * within the same tick (no `await` between), so neither source can have moved:
 *
 * - `sync-run.ts` owns the single ambient read, by design.
 * - `stock-integrity.ts` scopes local writes; no request, no report.
 * - `health-check.ts` reads the store and calls `getSyncCounts()` immediately;
 *   a mismatch could at worst trigger one spare resync, never corruption.
 * - `reconcile-quantities.ts` likewise, and the server scopes that endpoint by
 *   each batch's product's store rather than by the header.
 * - `device-report-command.ts` uses it for a prose label in a support report.
 *
 * The limit, stated so nobody over-trusts this: the allowlist is by FILE, so
 * adding a genuinely run-scoped ambient read to one of these five would not be
 * caught here.
 */
const MAY_READ_AMBIENT_STORE = new Set([
  "sync-run.ts",
  "stock-integrity.ts",
  "health-check.ts",
  "reconcile-quantities.ts",
  "device-report-command.ts",
]);

describe("the sync engine takes its store from the run, not from ambient state", () => {
  it("has exactly one file that reads the ambient active store", () => {
    const offenders = readdirSync(ENGINE_DIR)
      .filter((file) => file.endsWith(".ts"))
      .filter((file) => !MAY_READ_AMBIENT_STORE.has(file))
      .filter((file) => {
        const source = readFileSync(join(ENGINE_DIR, file), "utf8");
        return (
          source.includes("getActiveStoreId") ||
          source.includes("getStoredActiveStoreId")
        );
      });

    expect(offenders).toEqual([]);
  });
});
