import { describe, it, expect, beforeAll, beforeEach, vi } from "vitest";
import initSqlJs, { type Database } from "sql.js";

vi.mock("idb-keyval", () => ({
  get: vi.fn(() => Promise.resolve(undefined)),
  set: vi.fn(() => Promise.resolve(undefined)),
}));

// Phase 1 of the stuck-data work.
// Rationale: docs/CLIENT_COMMENTS.md#block-__tests__-stock-fingerprint-test-ts-L9
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
    // runSchemaMigrations() adds store_id to every STORE_SCOPED_TABLES entry on a real device; SCHEMA_SQL alone does not, and…
    // Rationale: docs/CLIENT_COMMENTS.md#line-__tests__-stock-fingerprint-test-ts-L29
    db.run("ALTER TABLE stock_batches ADD COLUMN store_id TEXT");
    db.run("ALTER TABLE products ADD COLUMN store_id TEXT");
    core.__setDatabaseForTesting(db);
  });

  beforeEach(() => {
    db.run("DELETE FROM stock_batches; DELETE FROM products;");
    db.run(
      `INSERT INTO products (id, name, store_id, _deleted) VALUES ('p-store-1', 'Gluformin', 'store-1', 0), ('p-store-2', 'Other', 'store-2', 0)`,
    );
    core.setActiveStoreId("store-1");
  });

  const insertBatch = (
    id: string,
    storeId: string | null,
    quantity: number,
    deleted = 0,
    costPrice: number | null = 0,
    productId = `p-${storeId}`,
  ) => {
    db.run(
      `INSERT INTO stock_batches (id, product_id, store_id, quantity, batch_number, cost_price, _deleted)
       VALUES (?, ?, ?, ?, 'B', ?, ?)`,
      [id, productId, storeId, quantity, costPrice, deleted],
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

  it("counts a batch by its product's store, as the server and the pull do, even when its own store_id is empty (A-246)", async () => {
    insertBatch("b1", "store-1", 10);
    insertBatch("legacy", null, 7, 0, 0, "p-store-1");

    expect((await buildStockFingerprint("store-1"))?.batch_count).toBe(2);
  });

  it("leaves out a batch stamped with this store whose product belongs to another (A-246)", async () => {
    insertBatch("b1", "store-1", 10);
    insertBatch("stray", "store-1", 5, 0, 0, "p-store-2");

    expect(await buildStockFingerprint("store-1")).toEqual({ batch_count: 1, quantity_sum: 10, value_sum: 0 });
  });

  it("still counts a batch of a discontinued product, as the server's withTrashed() does", async () => {
    db.run("UPDATE products SET _deleted = 1 WHERE id = 'p-store-1'");
    insertBatch("b1", "store-1", 10);

    expect((await buildStockFingerprint("store-1"))?.batch_count).toBe(1);
  });

  it("leaves out a batch whose product row this device does not hold yet", async () => {
    insertBatch("b1", "store-1", 10);
    insertBatch("orphan", "store-1", 4, 0, 0, "p-not-pulled");

    expect((await buildStockFingerprint("store-1"))?.batch_count).toBe(1);
  });

  /** Reporting must never be able to fail a sync. */
  it("returns null instead of throwing when there is no active store", async () => {
    core.setActiveStoreId(null);

    expect(await buildStockFingerprint(null)).toBeNull();
  });
});
