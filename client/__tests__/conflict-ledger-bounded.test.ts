import { describe, it, expect, beforeAll, beforeEach, vi } from "vitest";
import initSqlJs, { type Database } from "sql.js";

vi.mock("idb-keyval", () => ({
  get: vi.fn(async () => undefined),
  set: vi.fn(async () => undefined),
}));

/**
 * The ledger was allowlisted to `purchase_order_items`, so a terminal drop on
 * any other table left no local trace: once the push finished the queue was
 * empty and the conflict count was zero. That is why the repeated "changes
 * could not be saved" loops were never diagnosable. Widening it means it has
 * to be bounded instead.
 */
describe("the terminal-conflict ledger", () => {
  let db: Database;
  let core: typeof import("@/lib/db/core");
  let log: typeof import("@/lib/db/sync-engine/conflict-log");

  beforeAll(async () => {
    core = await import("@/lib/db/core");
    log = await import("@/lib/db/sync-engine/conflict-log");

    const { SCHEMA_SQL } = await import("@/lib/db/schema");
    const SQL = await initSqlJs({
      locateFile: () => require.resolve("sql.js/dist/sql-wasm.wasm"),
    });
    db = new SQL.Database();
    db.run(SCHEMA_SQL);
    core.__setDatabaseForTesting(db);
  });

  beforeEach(() => db.run(`DELETE FROM _sync_conflicts`));

  const count = () =>
    Number(db.exec(`SELECT COUNT(*) FROM _sync_conflicts`)[0].values[0][0]);

  it("records a drop on a table that was previously not logged at all", async () => {
    await log.recordTerminalConflict({
      table_name: "products",
      record_id: "p1",
      reason: "version_conflict",
      fields: "name,price",
    });

    expect(count()).toBe(1);
  });

  it("still records the purchase-order case its reader depends on", async () => {
    await log.recordTerminalConflict({
      table_name: "purchase_order_items",
      record_id: "poi-1",
      reason: "stale_timestamp",
      fields: "quantity",
    });

    expect(count()).toBe(1);
  });

  it("stays bounded once every table writes to it", async () => {
    for (let i = 0; i < 540; i++) {
      await log.recordTerminalConflict({
        table_name: "products",
        record_id: `p${i}`,
        reason: "version_conflict",
        fields: null,
      });
    }

    expect(count()).toBeLessThanOrEqual(500);
  });

  it("prunes resolved rows before unresolved ones, since unresolved is the signal", async () => {
    // 520 resolved + 20 unresolved: the prune must take resolved rows and
    // leave every unresolved drop intact.
    for (let i = 0; i < 520; i++) {
      await log.recordTerminalConflict({
        table_name: "products",
        record_id: `old${i}`,
        reason: "version_conflict",
        fields: null,
      });
    }
    db.run(`UPDATE _sync_conflicts SET resolved_at = '2026-10-01T00:00:00Z'`);

    for (let i = 0; i < 20; i++) {
      await log.recordTerminalConflict({
        table_name: "sales",
        record_id: `new${i}`,
        reason: "stale_timestamp",
        fields: null,
      });
    }

    const unresolved = Number(
      db.exec(`SELECT COUNT(*) FROM _sync_conflicts WHERE resolved_at IS NULL`)[0]
        .values[0][0],
    );
    expect(unresolved).toBe(20);
    expect(count()).toBeLessThanOrEqual(500);
  });

  it("settles a record on any table once a later change reaches the server", async () => {
    await log.recordTerminalConflict({
      table_name: "products",
      record_id: "p1",
      reason: "version_conflict",
      fields: null,
    });

    await log.resolveConflictsForRecords([
      { table_name: "products", record_id: "p1" },
    ]);

    const unresolved = Number(
      db.exec(`SELECT COUNT(*) FROM _sync_conflicts WHERE resolved_at IS NULL`)[0]
        .values[0][0],
    );
    expect(unresolved).toBe(0);
  });
});
