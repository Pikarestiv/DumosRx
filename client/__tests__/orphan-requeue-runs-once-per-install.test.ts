import { describe, it, expect, beforeAll, beforeEach, vi } from "vitest";
import initSqlJs, { type Database } from "sql.js";

vi.mock("idb-keyval", () => ({
  get: vi.fn(() => Promise.resolve(undefined)),
  set: vi.fn(() => Promise.resolve(undefined)),
}));

// A-8 (docs/KNOWN_BUGS.md), boot-scan half:
// Rationale: docs/CLIENT_COMMENTS.md#block-__tests__-orphan-requeue-runs-once-per-install-test-ts-L9
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

  // A-274. This case previously asserted the opposite — that a recorded crash re-triggers the scan — and that is the mechani…
  // Rationale: docs/CLIENT_COMMENTS.md#block-__tests__-orphan-requeue-runs-once-per-install-test-ts-L79
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
