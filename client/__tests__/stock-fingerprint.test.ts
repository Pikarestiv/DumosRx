import { describe, it, expect, beforeAll, beforeEach, vi } from "vitest";
import initSqlJs, { type Database } from "sql.js";

vi.mock("idb-keyval", () => ({
  get: vi.fn(async () => undefined),
  set: vi.fn(async () => undefined),
}));

/**
 * Phase 1 of the stuck-data work. The server derives stock from movements and
 * the client derives it locally; neither ever compared the two, so a device
 * drifting (A-173/A-176) was invisible until a physical count found it.
 */
describe("buildStockFingerprint", () => {
  let db: Database;
  let core: typeof import("@/lib/db/core");
  let buildStockFingerprint: typeof import("@/lib/db/sync-engine/stock-fingerprint").buildStockFingerprint;

  beforeAll(async () => {
    core = await import("@/lib/db/core");
    ({ buildStockFingerprint } = await import("@/lib/db/sync-engine/stock-fingerprint"));

    const { SCHEMA_SQL } = await import("@/lib/db/schema");
    const SQL = await initSqlJs({
      locateFile: () => require.resolve("sql.js/dist/sql-wasm.wasm"),
    });
    db = new SQL.Database();
    db.run(SCHEMA_SQL);
    // runSchemaMigrations() adds store_id to every STORE_SCOPED_TABLES entry
    // on a real device; SCHEMA_SQL alone does not, and the query under test
    // relies on it exactly as health-check.ts already does.
    db.run("ALTER TABLE stock_batches ADD COLUMN store_id TEXT");
    core.__setDatabaseForTesting(db);
  });

  beforeEach(() => {
    db.run("DELETE FROM stock_batches;");
    core.setActiveStoreId("store-1");
  });

  const insertBatch = (
    id: string,
    storeId: string,
    quantity: number,
    deleted = 0,
    costPrice: number | null = 0,
  ) => {
    db.run(
      `INSERT INTO stock_batches (id, product_id, store_id, quantity, batch_number, cost_price, _deleted)
       VALUES ('${id}', 'p1', '${storeId}', ${quantity}, 'B', ${
         costPrice === null ? "NULL" : costPrice
       }, ${deleted})`,
    );
  };

  it("sums the active store's live batches", async () => {
    insertBatch("b1", "store-1", 10);
    insertBatch("b2", "store-1", 5.5);

    expect(await buildStockFingerprint("store-1")).toEqual({
      batch_count: 2,
      quantity_sum: 15.5,
      value_sum: 0,
    });
  });

  it("excludes soft-deleted batches", async () => {
    insertBatch("b1", "store-1", 10);
    insertBatch("b2", "store-1", 99, 1);

    expect(await buildStockFingerprint("store-1")).toEqual({
      batch_count: 1,
      quantity_sum: 10,
      value_sum: 0,
    });
  });

  it("excludes another store's batches", async () => {
    insertBatch("b1", "store-1", 10);
    insertBatch("b2", "store-2", 999);

    expect(await buildStockFingerprint("store-1")).toEqual({
      batch_count: 1,
      quantity_sum: 10,
      value_sum: 0,
    });
  });

  it("reports zero rather than null for a store with no stock", async () => {
    expect(await buildStockFingerprint("store-1")).toEqual({
      batch_count: 0,
      quantity_sum: 0,
      value_sum: 0,
    });
  });

  it("values stock at quantity x cost price, over the same rows it counts", async () => {
    insertBatch("b1", "store-1", 10, 0, 2.5);
    insertBatch("b2", "store-1", 4, 0, 100);
    insertBatch("b3", "store-1", 999, 1, 50);
    insertBatch("b4", "store-2", 999, 0, 50);

    expect(await buildStockFingerprint("store-1")).toEqual({
      batch_count: 2,
      quantity_sum: 14,
      value_sum: 425,
    });
  });

  /** cost_price is nullable on stock_batches (schema.ts:48), and a batch with
   * no cost is worth nothing rather than making the whole sum null. */
  it("treats a batch with no cost price as worth zero", async () => {
    insertBatch("b1", "store-1", 10, 0, null);
    insertBatch("b2", "store-1", 2, 0, 3);

    expect(await buildStockFingerprint("store-1")).toEqual({
      batch_count: 2,
      quantity_sum: 12,
      value_sum: 6,
    });
  });

  /** Reporting must never be able to fail a sync. */
  it("returns null instead of throwing when there is no active store", async () => {
    core.setActiveStoreId(null);

    expect(await buildStockFingerprint(null)).toBeNull();
  });
});
