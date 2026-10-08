import { describe, it, expect, beforeAll, beforeEach, vi } from "vitest";
import initSqlJs, { type Database } from "sql.js";

vi.mock("idb-keyval", () => ({
  get: vi.fn(async () => undefined),
  set: vi.fn(async () => undefined),
}));

/**
 * Phase 1 of docs/superpowers/specs/2026-10-08-stock-integrity-fold-design.md.
 *
 * A production store showed 958 of 2,495 products carrying exactly twice
 * their opening stock on one device, while the server was correct throughout.
 * Nothing could repair it: pull.ts strips `quantity` from every pulled batch
 * and an existing movement replays no delta, so the drift was permanent. The
 * movement log is the authority — this verifies a batch against it.
 *
 * verifyStockIntegrity() must never write.
 */
describe("verifyStockIntegrity", () => {
  let db: Database;
  let core: typeof import("@/lib/db/core");
  let verifyStockIntegrity: typeof import("@/lib/db/sync-engine/stock-integrity").verifyStockIntegrity;

  beforeAll(async () => {
    core = await import("@/lib/db/core");
    ({ verifyStockIntegrity } = await import("@/lib/db/sync-engine/stock-integrity"));

    const { SCHEMA_SQL } = await import("@/lib/db/schema");
    const SQL = await initSqlJs({
      locateFile: () => require.resolve("sql.js/dist/sql-wasm.wasm"),
    });
    db = new SQL.Database();
    db.run(SCHEMA_SQL);
    core.__setDatabaseForTesting(db);
  });

  beforeEach(() => {
    db.run(`DELETE FROM stock_movements; DELETE FROM stock_batches; DELETE FROM products; DELETE FROM _sync_queue;`);
  });

  function batch(id: string, quantity: number, isActive = 1, deleted = 0) {
    db.run(
      `INSERT INTO stock_batches (id, product_id, batch_number, quantity, is_active, _deleted)
       VALUES ('${id}', 'prod-${id}', 'Opening Stock', ${quantity}, ${isActive}, ${deleted})`,
    );
  }

  function movement(id: string, batchId: string, quantity: number, deleted = 0) {
    db.run(
      `INSERT INTO stock_movements (id, product_id, stock_batch_id, movement_type, quantity, _deleted)
       VALUES ('${id}', 'prod-${batchId}', '${batchId}', 'purchase', ${quantity}, ${deleted})`,
    );
  }

  it("reports a batch matching its movement log as consistent", async () => {
    batch("b1", 5);
    movement("m1", "b1", 5);

    const report = await verifyStockIntegrity();

    expect(report.checked).toBe(1);
    expect(report.consistent).toBe(1);
    expect(report.diverged).toBe(0);
    expect(report.netUnitDelta).toBe(0);
  });

  it("flags the real production case: quantity 10 against a single +5 movement", async () => {
    batch("b1", 10);
    movement("m1", "b1", 5);

    const report = await verifyStockIntegrity();

    expect(report.diverged).toBe(1);
    expect(report.divergedBatches[0].batchQuantity).toBe(10);
    expect(report.divergedBatches[0].movementQuantity).toBe(5);
    expect(report.divergedBatches[0].delta).toBe(5);
  });

  it("classifies a batch holding stock with no movements as unreconstructable, never diverged", async () => {
    batch("b1", 40);

    const report = await verifyStockIntegrity();

    expect(report.unreconstructable).toBe(1);
    expect(report.diverged).toBe(0);
    expect(report.unreconstructableBatches[0].batchQuantity).toBe(40);
  });

  it("treats an empty batch with no movements as consistent, not unreconstructable", async () => {
    batch("b1", 0);

    const report = await verifyStockIntegrity();

    expect(report.consistent).toBe(1);
    expect(report.unreconstructable).toBe(0);
  });

  it("counts an unpushed local sale, so a later fold cannot discard unsynced work", async () => {
    batch("b1", 8);
    movement("m1", "b1", 10);
    movement("m2", "b1", -2);
    db.run(
      `INSERT INTO _sync_queue (table_name, record_id, operation, payload, created_at)
       VALUES ('stock_movements', 'm2', 'INSERT', '{}', '2026-10-08T00:00:00Z')`,
    );

    const report = await verifyStockIntegrity();

    expect(report.consistent).toBe(1);
    expect(report.diverged).toBe(0);
  });

  it("ignores soft-deleted movements", async () => {
    batch("b1", 5);
    movement("m1", "b1", 5);
    movement("m2", "b1", 99, 1);

    const report = await verifyStockIntegrity();

    expect(report.consistent).toBe(1);
  });

  it("ignores inactive and soft-deleted batches", async () => {
    batch("b1", 10, 0, 0);
    batch("b2", 10, 1, 1);

    const report = await verifyStockIntegrity();

    expect(report.checked).toBe(0);
  });

  it("writes nothing", async () => {
    batch("b1", 10);
    movement("m1", "b1", 5);

    await verifyStockIntegrity();

    const after = db.exec(`SELECT quantity FROM stock_batches WHERE id = 'b1'`);
    expect(after[0].values[0][0]).toBe(10);
    const queue = db.exec(`SELECT COUNT(*) FROM _sync_queue`);
    expect(queue[0].values[0][0]).toBe(0);
  });

  it("nets deltas across batches in both directions", async () => {
    batch("b1", 10);
    movement("m1", "b1", 5);
    batch("b2", 3);
    movement("m2", "b2", 11);

    const report = await verifyStockIntegrity();

    expect(report.diverged).toBe(2);
    expect(report.netUnitDelta).toBe(5 + -8);
  });
});
