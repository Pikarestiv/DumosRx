import { describe, it, expect, beforeAll, beforeEach, vi } from "vitest";
import initSqlJs, { type Database } from "sql.js";

vi.mock("idb-keyval", () => ({
  get: vi.fn(async () => undefined),
  set: vi.fn(async () => undefined),
}));

/**
 * Phase 2 of docs/superpowers/specs/2026-10-08-stock-integrity-fold-design.md.
 *
 * A device held 958 products at exactly twice their opening stock while the
 * server was correct, and nothing in the product could repair it: the pull
 * strips `quantity`, an existing movement replays no delta, and Health Sync
 * points the wrong way. The only fix was a factory reset, which works solely
 * because a fresh database rebuilds quantity from the movement log.
 *
 * foldStockQuantities() does that rebuild in place — and must refuse any
 * batch the log cannot account for.
 */
const STORE_ID = "store-1";

describe("foldStockQuantities", () => {
  let db: Database;
  let core: typeof import("@/lib/db/core");
  let foldStockQuantities: typeof import("@/lib/db/sync-engine/stock-integrity").foldStockQuantities;

  beforeAll(async () => {
    core = await import("@/lib/db/core");
    ({ foldStockQuantities } = await import("@/lib/db/sync-engine/stock-integrity"));

    const { SCHEMA_SQL } = await import("@/lib/db/schema");
    const SQL = await initSqlJs({
      locateFile: () => require.resolve("sql.js/dist/sql-wasm.wasm"),
    });
    db = new SQL.Database();
    db.run(SCHEMA_SQL);
    // SCHEMA_SQL predates multi-store; schema-migrations.ts adds store_id at
    // runtime. Added here so the store-scoped query branch is actually
    // exercised instead of silently falling through to "every store".
    db.run(`ALTER TABLE stock_batches ADD COLUMN store_id TEXT`);
    db.run(`ALTER TABLE products ADD COLUMN store_id TEXT`);
    core.__setDatabaseForTesting(db);
    core.setActiveStoreId(STORE_ID);
  });

  beforeEach(() => {
    db.run(
      `DELETE FROM stock_batches; DELETE FROM stock_movements; DELETE FROM _sync_queue;`,
    );
  });

  function batch(id: string, quantity: number) {
    db.run(
      `INSERT INTO stock_batches (id, product_id, batch_number, quantity, is_active, _deleted, store_id)
       VALUES ('${id}', 'prod-${id}', 'Opening Stock', ${quantity}, 1, 0, '${STORE_ID}')`,
    );
  }

  let clock = 0;
  function movement(id: string, batchId: string, quantity: number, synced = 1) {
    clock += 1;
    const at = `2026-10-01T00:00:${String(clock).padStart(2, "0")}Z`;
    db.run(
      `INSERT INTO stock_movements (id, product_id, stock_batch_id, movement_type, quantity, _deleted, _synced, created_at)
       VALUES ('${id}', 'prod-${batchId}', '${batchId}', 'purchase', ${quantity}, 0, ${synced}, '${at}')`,
    );
  }

  const quantityOf = (id: string) =>
    db.exec(`SELECT quantity FROM stock_batches WHERE id = '${id}'`)[0].values[0][0];

  it("rebuilds the real production case: quantity 10 against a single +5", async () => {
    batch("b1", 10);
    movement("m1", "b1", 5);

    const result = await foldStockQuantities();

    expect(result.folded).toBe(1);
    expect(result.unitsCorrected).toBe(5);
    expect(quantityOf("b1")).toBe(5);
  });

  it("refuses a batch holding stock with no movement behind it, and leaves it untouched", async () => {
    batch("b1", 40);

    const result = await foldStockQuantities();

    expect(result.folded).toBe(0);
    expect(result.refused).toBe(1);
    expect(result.refusedBatchIds).toEqual(["b1"]);
    expect(quantityOf("b1")).toBe(40);
  });

  it("never drives a quantity below zero", async () => {
    batch("b1", 3);
    movement("m1", "b1", 5);
    movement("m2", "b1", -40);

    await foldStockQuantities();

    expect(quantityOf("b1")).toBe(0);
  });

  it("counts an unpushed local sale, so a fold cannot discard unsynced work", async () => {
    batch("b1", 10);
    movement("m1", "b1", 10);
    // Rung up on this device and not yet pushed.
    movement("m2", "b1", -3, 0);
    db.run(
      `INSERT INTO _sync_queue (table_name, record_id, operation, payload, created_at)
       VALUES ('stock_movements', 'm2', 'INSERT', '{}', '2026-10-09T00:00:00Z')`,
    );

    await foldStockQuantities();

    expect(quantityOf("b1")).toBe(7);
    // The queued push is untouched: the fold is local and claims nothing.
    const queued = db.exec(`SELECT COUNT(*) FROM _sync_queue`);
    expect(queued[0].values[0][0]).toBe(1);
  });

  it("leaves a consistent batch alone", async () => {
    batch("b1", 5);
    movement("m1", "b1", 5);

    const result = await foldStockQuantities();

    expect(result.folded).toBe(0);
    expect(quantityOf("b1")).toBe(5);
  });

  it("leaves a batch floored by an oversell alone rather than folding it twice", async () => {
    batch("b1", 0);
    movement("m1", "b1", 5);
    movement("m2", "b1", -8);

    const result = await foldStockQuantities();

    expect(result.folded).toBe(0);
    expect(quantityOf("b1")).toBe(0);
  });

  it("writes no stock_movements of its own", async () => {
    batch("b1", 10);
    movement("m1", "b1", 5);

    await foldStockQuantities();

    const movements = db.exec(`SELECT COUNT(*) FROM stock_movements`);
    expect(movements[0].values[0][0]).toBe(1);
  });

  it("is idempotent", async () => {
    batch("b1", 10);
    movement("m1", "b1", 5);

    await foldStockQuantities();
    const second = await foldStockQuantities();

    expect(second.folded).toBe(0);
    expect(quantityOf("b1")).toBe(5);
  });

  it("does not destroy stock on a batch that was floored and then restocked", async () => {
    // Both the pull and the server apply MAX(0, …) after EVERY movement, so
    // quantity is path-dependent: +10, -12, +3 lands on 3, not on the raw
    // sum of 1. Folding to the sum silently destroyed two real units.
    batch("b1", 3);
    movement("m1", "b1", 10);
    movement("m2", "b1", -12);
    movement("m3", "b1", 3);

    const result = await foldStockQuantities();

    expect(result.folded).toBe(0);
    expect(quantityOf("b1")).toBe(3);
  });

  it("rebuilds a genuinely diverged batch to its replayed value, not its raw sum", async () => {
    batch("b1", 99);
    movement("m1", "b1", 10);
    movement("m2", "b1", -12);
    movement("m3", "b1", 3);

    await foldStockQuantities();

    expect(quantityOf("b1")).toBe(3);
  });

  it("refuses a batch whose delta has not been applied yet, so the drain cannot double it", async () => {
    batch("b1", 10);
    movement("m1", "b1", 10);
    movement("m2", "b1", 5);
    db.run(
      `INSERT INTO _pending_stock_deltas (movement_id, stock_batch_id, quantity, attempts)
       VALUES ('m2', 'b1', 5, 1)`,
    );

    const result = await foldStockQuantities();

    expect(result.folded).toBe(0);
    expect(quantityOf("b1")).toBe(10);
  });
});
