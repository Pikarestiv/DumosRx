import { describe, it, expect, beforeAll, beforeEach, vi } from "vitest";
import initSqlJs, { type Database } from "sql.js";

vi.mock("idb-keyval", () => ({
  get: vi.fn(async () => undefined),
  set: vi.fn(async () => undefined),
}));

/**
 * Regression coverage: audit_logs had no store_id column and was never
 * filtered by store, unlike every other data table (see
 * lib/db/core.ts's STORE_SCOPED_TABLES) — an owner/admin with access to
 * multiple stores could see every other store's activity log entries
 * (product edits, stock adjustments, user names) when viewing "their"
 * store's Activity Log page.
 */
describe("activity log store scoping", () => {
  let db: Database;
  let core: typeof import("@/lib/db/core");
  let getActivityLog: typeof import("@/lib/db/queries/activity-log").getActivityLog;
  let getDistinctActivityActions: typeof import("@/lib/db/queries/activity-log").getDistinctActivityActions;

  beforeAll(async () => {
    core = await import("@/lib/db/core");
    const activityLog = await import("@/lib/db/queries/activity-log");
    getActivityLog = activityLog.getActivityLog;
    getDistinctActivityActions = activityLog.getDistinctActivityActions;

    const { SCHEMA_SQL } = await import("@/lib/db/schema");
    const SQL = await initSqlJs({
      locateFile: () => require.resolve("sql.js/dist/sql-wasm.wasm"),
    });
    db = new SQL.Database();
    db.run(SCHEMA_SQL);
    core.__setDatabaseForTesting(db);
  });

  beforeEach(() => {
    db.run(`DELETE FROM audit_logs; DELETE FROM users;`);
    core.setActiveStoreId(null);
  });

  it("only returns the active store's audit log entries", async () => {
    db.run(`INSERT INTO audit_logs (id, action, table_name, record_id, store_id, created_at) VALUES
      ('a1', 'UPDATE', 'products', 'p1', 'store-a', '2026-01-01'),
      ('a2', 'UPDATE', 'products', 'p2', 'store-b', '2026-01-01')`);

    core.setActiveStoreId("store-a");
    const { rows, total } = await getActivityLog();

    expect(rows.map((r) => r.id)).toEqual(["a1"]);
    expect(total).toBe(1);
  });

  it("scopes the distinct-actions filter list to the active store too", async () => {
    db.run(`INSERT INTO audit_logs (id, action, table_name, record_id, store_id, created_at) VALUES
      ('a1', 'CREATE_SALE', 'sales', 's1', 'store-a', '2026-01-01'),
      ('a2', 'DELETE_PRODUCT', 'products', 'p2', 'store-b', '2026-01-01')`);

    core.setActiveStoreId("store-a");
    const actions = await getDistinctActivityActions();

    expect(actions).toEqual(["CREATE_SALE"]);
  });

  it("returns every store's entries when no store is active (single-store/legacy device)", async () => {
    db.run(`INSERT INTO audit_logs (id, action, table_name, record_id, store_id, created_at) VALUES
      ('a1', 'UPDATE', 'products', 'p1', 'store-a', '2026-01-01'),
      ('a2', 'UPDATE', 'products', 'p2', NULL, '2026-01-01')`);

    core.setActiveStoreId(null);
    const { total } = await getActivityLog();

    expect(total).toBe(2);
  });
});
