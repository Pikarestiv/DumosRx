import { describe, it, expect, beforeAll, beforeEach, vi } from "vitest";
import initSqlJs, { type Database } from "sql.js";

vi.mock("idb-keyval", () => ({
  get: vi.fn(async () => undefined),
  set: vi.fn(async () => undefined),
}));

// Stage 1 of docs/superpowers/specs/2026-10-10-derived-stock-quantity-design.md:
// Rationale: docs/CLIENT_COMMENTS.md#block-__tests__-batch-quantity-recompute-test-ts-L9
const STORE_ID = "store-1";

describe("stock_batches.quantity derived from the movement log", () => {
  let db: Database;
  let core: typeof import("@/lib/db/core");
  let insert: typeof import("@/lib/db/base-helpers").insert;
  let softDelete: typeof import("@/lib/db/base-helpers").softDelete;
  let recomputeBatchQuantities: typeof import("@/lib/db/batch-quantity").recomputeBatchQuantities;

  beforeAll(async () => {
    core = await import("@/lib/db/core");
    ({ insert, softDelete } = await import("@/lib/db/base-helpers"));
    ({ recomputeBatchQuantities } = await import("@/lib/db/batch-quantity"));

    const { SCHEMA_SQL } = await import("@/lib/db/schema");
    const SQL = await initSqlJs({
      locateFile: () => require.resolve("sql.js/dist/sql-wasm.wasm"),
    });
    db = new SQL.Database();
    db.run(SCHEMA_SQL);
    db.run(`ALTER TABLE stock_batches ADD COLUMN store_id TEXT`);
    db.run(`ALTER TABLE products ADD COLUMN store_id TEXT`);
    db.run(`ALTER TABLE stock_movements ADD COLUMN store_id TEXT`);
    core.__setDatabaseForTesting(db);
    core.setActiveStoreId(STORE_ID);
  });

  beforeEach(() => {
    db.run(
      `DELETE FROM stock_movements; DELETE FROM stock_batches; DELETE FROM products;
       DELETE FROM _sync_queue; DELETE FROM audit_logs;`,
    );
    db.run(
      `INSERT INTO products (id, name, _deleted, store_id)
       VALUES ('prod-1', 'Pentazocine Inj', 0, '${STORE_ID}')`,
    );
  });

  /** A batch whose stored quantity is seeded directly, the way a pull does. */
  function seedBatch(id: string, quantity: number) {
    db.run(
      `INSERT INTO stock_batches (id, product_id, batch_number, quantity, is_active, _deleted, store_id)
       VALUES ('${id}', 'prod-1', 'Opening Stock', ${quantity}, 1, 0, '${STORE_ID}')`,
    );
  }

  function seedMovement(id: string, batchId: string, quantity: number) {
    db.run(
      `INSERT INTO stock_movements (id, product_id, stock_batch_id, movement_type, quantity, _deleted, store_id)
       VALUES ('${id}', 'prod-1', '${batchId}', '${quantity > 0 ? "purchase" : "sale"}', ${quantity}, 0, '${STORE_ID}')`,
    );
  }

  function logMovement(batchId: string, quantity: number) {
    return insert("stock_movements", {
      product_id: "prod-1",
      stock_batch_id: batchId,
      movement_type: quantity > 0 ? "purchase" : "sale",
      quantity,
    });
  }

  const quantityOf = (batchId: string): number => {
    const rows = db.exec(`SELECT quantity FROM stock_batches WHERE id = '${batchId}'`);
    return Number(rows[0]?.values?.[0]?.[0] ?? -1);
  };

  const queuedBatchPushes = (batchId: string): number => {
    const rows = db.exec(
      `SELECT COUNT(*) FROM _sync_queue WHERE table_name = 'stock_batches' AND record_id = '${batchId}'`,
    );
    return Number(rows[0]?.values?.[0]?.[0] ?? 0);
  };

  it("rebuilds the quantity from the whole log when a movement is logged", async () => {
    seedBatch("b1", 0);

    await logMovement("b1", 80);
    expect(quantityOf("b1")).toBe(80);

    await logMovement("b1", -28);
    expect(quantityOf("b1")).toBe(52);
  });

  it("is idempotent: recomputing a batch twice equals recomputing it once", async () => {
    seedBatch("b1", 0);
    await logMovement("b1", 80);
    await logMovement("b1", -28);

    await recomputeBatchQuantities(new Map([["b1", { delta: 0, inbound: 0 }]]));
    await recomputeBatchQuantities(new Map([["b1", { delta: 0, inbound: 0 }]]));

    expect(quantityOf("b1")).toBe(52);
  });

  it("tolerates a lost movement: the quantity is right as soon as the log is", async () => {
    seedBatch("b1", 0);
    seedMovement("mv-early", "b1", 80);

    // Nothing recomputed the batch when that movement landed.
    expect(quantityOf("b1")).toBe(0);

    await logMovement("b1", -28);

    expect(quantityOf("b1")).toBe(52);
  });

  it("is order-independent: the same log in any order gives the same quantity", async () => {
    seedBatch("b1", 0);
    seedBatch("b2", 0);

    for (const delta of [50, -20, 10, -5]) await logMovement("b1", delta);
    for (const delta of [-5, 10, -20, 50]) await logMovement("b2", delta);

    expect(quantityOf("b1")).toBe(35);
    expect(quantityOf("b2")).toBe(quantityOf("b1"));
  });

  it("carries an oversell forward instead of forgiving it per movement", async () => {
    seedBatch("b1", 0);

    for (const delta of [80, -100, 20]) await logMovement("b1", delta);

    // Per-movement flooring would give 20; one floor over the sum gives 0.
    expect(quantityOf("b1")).toBe(0);
  });

  it("counts a movement that has not been pushed yet", async () => {
    seedBatch("b1", 0);
    await logMovement("b1", 80);

    const unsynced = db.exec(
      `SELECT COUNT(*) FROM stock_movements WHERE stock_batch_id = 'b1' AND _synced = 0`,
    );
    expect(Number(unsynced[0].values[0][0])).toBe(1);
    expect(quantityOf("b1")).toBe(80);
  });

  it("drops a voided movement's contribution when it is soft-deleted", async () => {
    seedBatch("b1", 0);
    await logMovement("b1", 80);
    const saleId = await logMovement("b1", -28);
    expect(quantityOf("b1")).toBe(52);

    await softDelete("stock_movements", saleId);

    expect(quantityOf("b1")).toBe(80);
  });

  it("queues the batch for push and bumps updated_at, as the incremental write did", async () => {
    seedBatch("b1", 0);
    db.run(`UPDATE stock_batches SET updated_at = '2020-01-01T00:00:00Z' WHERE id = 'b1'`);

    await logMovement("b1", 80);

    expect(queuedBatchPushes("b1")).toBe(1);
    const rows = db.exec(`SELECT updated_at FROM stock_batches WHERE id = 'b1'`);
    expect(String(rows[0].values[0][0])).not.toBe("2020-01-01T00:00:00Z");
  });

  describe("the A-148 carve-out: stock the log cannot account for is never recomputed", () => {
    it("adds a found-stock adjustment to a legacy batch instead of folding it to the delta", async () => {
      seedBatch("legacy", 100);

      await logMovement("legacy", 2);

      expect(quantityOf("legacy")).toBe(102);
    });

    it("keeps the carve-out after the batch has had a movement logged against it (A-215)", async () => {
      seedBatch("legacy", 100);
      await logMovement("legacy", 2);

      await logMovement("legacy", -3);

      expect(quantityOf("legacy")).toBe(99);
    });

    it("stays a carve-out after its stock has been sold below a later inbound movement", async () => {
      // The classification must read the log as it was BEFORE this movement.
      // Rationale: docs/CLIENT_COMMENTS.md#line-__tests__-batch-quantity-recompute-test-ts-L195
      seedBatch("legacy", 100);
      await logMovement("legacy", -95);
      expect(quantityOf("legacy")).toBe(5);

      await logMovement("legacy", 10);

      expect(quantityOf("legacy")).toBe(15);
    });

    it("keeps a legacy batch's units when a sale against it is returned", async () => {
      seedBatch("legacy", 100);
      await logMovement("legacy", -60);

      await logMovement("legacy", 50);

      expect(quantityOf("legacy")).toBe(90);
    });

    it("keeps the carve-out when a logged inbound movement is voided", async () => {
      seedBatch("legacy", 100);
      const found = await logMovement("legacy", 10);
      expect(quantityOf("legacy")).toBe(110);

      await softDelete("stock_movements", found);

      expect(quantityOf("legacy")).toBe(100);
    });

    it("adds found stock that happens to equal the unlogged remainder", async () => {
      // The residue and the movement being equal is the one case a value-based "already correct, nothing to write" guess gets wr…
      // Rationale: docs/CLIENT_COMMENTS.md#line-__tests__-batch-quantity-recompute-test-ts-L229
      seedBatch("legacy", 100);

      await logMovement("legacy", 100);

      expect(quantityOf("legacy")).toBe(200);
    });

    it("adds found stock equal to what is left of a part-sold legacy batch", async () => {
      seedBatch("legacy", 100);
      await logMovement("legacy", -50);
      expect(quantityOf("legacy")).toBe(50);

      await logMovement("legacy", 100);

      expect(quantityOf("legacy")).toBe(150);
    });

    it("leaves the carve-out once outbound overtakes the unlogged residue, which can happen with stock still on the shelf", async () => {
      // The boundary is `unlogged residue > cumulative outbound`, not "stored has reached 0":
      // Rationale: docs/CLIENT_COMMENTS.md#line-__tests__-batch-quantity-recompute-test-ts-L251
      seedBatch("legacy", 100);
      await logMovement("legacy", 200);
      expect(quantityOf("legacy")).toBe(300);

      await logMovement("legacy", -150);
      expect(quantityOf("legacy")).toBe(150);

      // Outbound (160) has now passed the residue (100). The shelf holds 140.
      await logMovement("legacy", -10);
      expect(quantityOf("legacy")).toBe(40);
    });

    it("holds the carve-out for a few more sales after a found-stock adjustment, then crosses", async () => {
      seedBatch("legacy", 100);
      await logMovement("legacy", -95);
      await logMovement("legacy", 10);
      expect(quantityOf("legacy")).toBe(15);

      await logMovement("legacy", -1);
      expect(quantityOf("legacy")).toBe(14);

      await logMovement("legacy", -5);
      expect(quantityOf("legacy")).toBe(9);

      // Outbound (101) passes the residue (100); the shelf holds 8.
      await logMovement("legacy", -1);
      expect(quantityOf("legacy")).toBe(0);
    });

    it("keeps counting correctly after a found-stock adjustment of the same size", async () => {
      seedBatch("legacy", 10);
      await logMovement("legacy", 10);
      expect(quantityOf("legacy")).toBe(20);

      await logMovement("legacy", -5);

      expect(quantityOf("legacy")).toBe(15);
    });

    it("never writes a negative quantity for a carve-out batch", async () => {
      seedBatch("legacy", 5);

      await logMovement("legacy", -9);

      expect(quantityOf("legacy")).toBe(0);
    });
  });

  it("fills a newly created batch from its own first movement", async () => {
    // A receipt, an import row and a transfer destination all create the batch at 0 and let the movement supply the figure.
    // Rationale: docs/CLIENT_COMMENTS.md#line-__tests__-batch-quantity-recompute-test-ts-L308
    await insert("stock_batches", {
      id: "fresh",
      product_id: "prod-1",
      batch_number: "PO-1",
      quantity: 0,
      is_active: 1,
    });

    await logMovement("fresh", 40);

    expect(quantityOf("fresh")).toBe(40);
  });

  it("writes nothing when a rebuild lands on the figure already stored", async () => {
    seedBatch("b1", 0);
    await logMovement("b1", 80);
    const before = queuedBatchPushes("b1");

    await recomputeBatchQuantities(new Map([["b1", { delta: 0, inbound: 0 }]]));

    expect(quantityOf("b1")).toBe(80);
    expect(queuedBatchPushes("b1")).toBe(before);
  });

  it("agrees with the in-memory fake the other suites rely on, over randomised histories", async () => {
    // Four suites stub @/lib/db/local-database and model this rule by hand in __tests__/helpers/fake-batch-quantity.ts.
    // Rationale: docs/CLIENT_COMMENTS.md#line-__tests__-batch-quantity-recompute-test-ts-L337
    const { applyMovementToFakeBatch } = await import("./helpers/fake-batch-quantity");

    let seed = 20261014;
    const random = () => {
      seed = (seed * 1103515245 + 12345) & 0x7fffffff;
      return seed / 0x7fffffff;
    };
    const pick = <T>(items: T[]): T => items[Math.floor(random() * items.length)];

    const mismatches: string[] = [];

    for (let caseIndex = 0; caseIndex < 80; caseIndex++) {
      db.run(`DELETE FROM stock_movements; DELETE FROM stock_batches;`);

      const batchId = `b-${caseIndex}`;
      const opening = pick([0, 0, 5, 40, 100]);
      const priorLog = Array.from({ length: Math.floor(random() * 4) }, () =>
        pick([-95, -60, -9, -3, 2, 10, 40]),
      );
      const delta = pick([-95, -60, -9, -3, 2, 10, 40, 50]);

      seedBatch(batchId, opening);
      priorLog.forEach((q, i) => seedMovement(`prior-${caseIndex}-${i}`, batchId, q));

      const fakeBatches = { [batchId]: { quantity: opening } };
      const fakeMovements: {
        stock_batch_id: string;
        quantity: number;
        _deleted?: number;
      }[] = priorLog.map((q) => ({ stock_batch_id: batchId, quantity: q }));

      const movementId = await logMovement(batchId, delta);
      const voidIt = random() < 0.25;
      if (voidIt) await softDelete("stock_movements", movementId);

      fakeMovements.push({ stock_batch_id: batchId, quantity: delta });
      applyMovementToFakeBatch(fakeBatches, fakeMovements, {
        stock_batch_id: batchId,
        quantity: delta,
      });
      if (voidIt) {
        fakeMovements[fakeMovements.length - 1]._deleted = 1;
        applyMovementToFakeBatch(
          fakeBatches,
          fakeMovements,
          { stock_batch_id: batchId, quantity: delta },
          false,
        );
      }

      if (fakeBatches[batchId].quantity !== quantityOf(batchId)) {
        mismatches.push(
          `case ${caseIndex}: opening ${opening}, prior [${priorLog.join(",")}], delta ${delta}${voidIt ? " (voided)" : ""} → real ${quantityOf(batchId)}, fake ${fakeBatches[batchId].quantity}`,
        );
      }
    }

    expect(mismatches).toEqual([]);
  });

  it("leaves a batch alone when the movement names one this device does not have", async () => {
    await expect(logMovement("absent-batch", 10)).resolves.toBeTruthy();
    expect(quantityOf("absent-batch")).toBe(-1);
  });
});
