import { describe, it, expect, beforeAll, beforeEach, vi } from "vitest";
import initSqlJs, { type Database } from "sql.js";

vi.mock("idb-keyval", () => ({
  get: vi.fn(async () => undefined),
  set: vi.fn(async () => undefined),
}));

/**
 * A whole-row requeue rebuilds its payload from `SELECT *`, so a column that
 * is nullable locally but NOT NULL (with a server-side DEFAULT) in MySQL
 * went up as an explicit `null` and was rejected by the write — the
 * stock_batches.cost_price failure in docs/FIXED_BUGS.md A-128. Null-valued
 * keys are stripped so the server applies its own default instead.
 */
describe("whole-row requeue payloads never carry a null value", () => {
  let db: Database;
  let core: typeof import("@/lib/db/core");

  beforeAll(async () => {
    core = await import("@/lib/db/core");
    const { SCHEMA_SQL } = await import("@/lib/db/schema");
    const SQL = await initSqlJs({
      locateFile: () => require.resolve("sql.js/dist/sql-wasm.wasm"),
    });
    db = new SQL.Database();
    db.run(SCHEMA_SQL);
    core.__setDatabaseForTesting(db);
  });

  beforeEach(() => {
    db.run(`DELETE FROM stock_batches; DELETE FROM _sync_queue;`);
  });

  function seedLegacyBatch(id: string) {
    db.run(
      `INSERT INTO stock_batches (id, product_id, batch_number, quantity, cost_price, _synced, _deleted)
       VALUES (?, 'prod-1', 'B-1', 5, NULL, 0, 0)`,
      [id],
    );
  }

  function queuedPayloads(): Record<string, unknown>[] {
    const rows = db.exec(`SELECT payload FROM _sync_queue`);
    if (rows.length === 0) return [];
    return rows[0].values.map((v) => JSON.parse(String(v[0])));
  }

  it("requeueOrphanedRows() omits a null cost_price instead of queueing it", async () => {
    seedLegacyBatch("batch-orphan");
    const { requeueOrphanedRows } = await import("@/lib/db/reconcile-identity");

    const result = await requeueOrphanedRows(["stock_batches"]);

    expect(result.stock_batches).toBe(1);
    const payloads = queuedPayloads();
    expect(payloads).toHaveLength(1);
    expect(payloads[0].id).toBe("batch-orphan");
    expect("cost_price" in payloads[0]).toBe(false);
    expect(Object.values(payloads[0])).not.toContain(null);
  });

  it("forceSyncAllData() omits a null cost_price instead of queueing it", async () => {
    seedLegacyBatch("batch-force");
    const { forceSyncAllData } = await import("@/lib/db/local-database");

    await forceSyncAllData();

    const batchPayload = queuedPayloads().find((p) => p.id === "batch-force");
    expect(batchPayload).toBeTruthy();
    expect("cost_price" in (batchPayload as Record<string, unknown>)).toBe(false);
    expect(Object.values(batchPayload as Record<string, unknown>)).not.toContain(null);
  });
});
