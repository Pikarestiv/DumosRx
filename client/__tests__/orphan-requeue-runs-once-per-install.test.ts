import { describe, it, expect, beforeAll, beforeEach, vi } from "vitest";
import initSqlJs, { type Database } from "sql.js";

vi.mock("idb-keyval", () => ({
  get: vi.fn(async () => undefined),
  set: vi.fn(async () => undefined),
}));

/**
 * A-8 (docs/KNOWN_BUGS.md), boot-scan half: DatabaseProvider ran
 * `requeueOrphanedRows(STORE_SCOPED_TABLES)` on EVERY boot — one
 * `SELECT * FROM <table> WHERE (_synced = 0 OR _synced IS NULL) AND id NOT IN
 * (SELECT record_id FROM _sync_queue …)` per store-scoped table. `_synced`
 * is unindexed, so that is a full scan of all 26 tables at every launch, to
 * repair a state that is created only by a write interrupted between its row
 * INSERT and its queue INSERT.
 *
 * It runs once per install, full stop. A-274 removed the second trigger — a
 * `force` passed when `localStorage` held crashes queued by a previous
 * session — because its premise does not hold and its cost is a full re-push
 * of the device's history. See client/AGENTS.md, "The boot-time orphan scan".
 */
describe("requeueOrphanedRowsOnce", () => {
  let db: Database;
  let core: typeof import("@/lib/db/core");
  let mod: typeof import("@/lib/db/reconcile-identity");

  beforeAll(async () => {
    core = await import("@/lib/db/core");
    mod = await import("@/lib/db/reconcile-identity");

    const { SCHEMA_SQL } = await import("@/lib/db/schema");
    const SQL = await initSqlJs({
      locateFile: () => require.resolve("sql.js/dist/sql-wasm.wasm"),
    });
    db = new SQL.Database();
    db.run(SCHEMA_SQL);
    core.__setDatabaseForTesting(db);
  });

  beforeEach(() => {
    db.run(`DELETE FROM customers; DELETE FROM _sync_queue;`);
    localStorage.clear();
    vi.clearAllMocks();
  });

  const insertOrphan = (id: string) => {
    db.run(
      `INSERT INTO customers (id, first_name, _synced, _deleted) VALUES ('${id}', 'Orphan', 0, 0)`,
    );
  };

  const queuedIds = () => {
    const rows = db.exec(`SELECT record_id FROM _sync_queue`);
    return rows.length === 0 ? [] : rows[0].values.map((v) => v[0]);
  };

  it("scans and requeues on the very first boot of an install", async () => {
    insertOrphan("c1");

    const result = await mod.requeueOrphanedRowsOnce(["customers"]);

    expect(result).not.toBeNull();
    expect(queuedIds()).toEqual(["c1"]);
  });

  it("does not scan again on a later boot of the same install", async () => {
    insertOrphan("c1");
    await mod.requeueOrphanedRowsOnce(["customers"]);
    db.run(`DELETE FROM _sync_queue`);

    // A second, third, ... boot: same orphan still there, but the scan must
    // not run again, so nothing is requeued.
    expect(await mod.requeueOrphanedRowsOnce(["customers"])).toBeNull();
    expect(await mod.requeueOrphanedRowsOnce(["customers"])).toBeNull();
    expect(queuedIds()).toEqual([]);
  });

  /**
   * A-274. This case previously asserted the opposite — that a recorded crash
   * re-triggers the scan — and that is the mechanism behind the 20,000-row
   * requeue storms. A crash reaching `localStorage` means the SQLite write
   * FAILED, so no row was committed and no orphan can exist; an orphan needs a
   * *partial* write, which `insert()` already makes impossible by wrapping the
   * row, its queue entry and its audit entry in one transaction. The real
   * orphan producer was a wipe that cleared `_sync_queue` while leaving three
   * store-scoped tables behind, and that is now closed at the source
   * (`local-wipe-leaves-no-orphans.test.ts`).
   */
  it("does not scan again just because a crash was recorded", async () => {
    await mod.requeueOrphanedRowsOnce(["customers"]);
    db.run(`DELETE FROM _sync_queue`);

    localStorage.setItem(
      "dumosrx_pending_crashes",
      JSON.stringify([{ message: "boom", platform: "web" }]),
    );
    insertOrphan("c2");

    expect(await mod.requeueOrphanedRowsOnce(["customers"])).toBeNull();
    expect(queuedIds()).toEqual([]);
  });

  /**
   * The boot path is what actually re-armed the scan, and no unit test of the
   * function can see that, so the decision is pinned where it was made.
   */
  it("is not re-armed by the boot path", async () => {
    const fs = await import("fs");
    const path = await import("path");
    const provider = fs.readFileSync(
      path.resolve(__dirname, "../lib/db/DatabaseProvider.tsx"),
      "utf-8",
    );

    expect(provider).toContain("requeueOrphanedRowsOnce");
    expect(provider).not.toContain("pendingCrashes");
    expect(provider).not.toMatch(/force\s*:/);
  });
});
