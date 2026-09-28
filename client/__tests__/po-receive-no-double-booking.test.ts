import { describe, it, expect, beforeAll, beforeEach, vi } from "vitest";
import initSqlJs, { type Database } from "sql.js";

vi.mock("idb-keyval", () => ({
  get: vi.fn(async () => undefined),
  set: vi.fn(async () => undefined),
}));

/**
 * A-9. Receiving the same purchase order from two devices booked the
 * delivery twice. The single-device double-click is guarded by the UI, but
 * `receivePurchaseOrder()` read the PO — including each line's
 * `quantity_received` — *outside* its transaction, so two receipts racing
 * each other both computed the full outstanding balance from the same stale
 * snapshot. Both then created a stock batch and a purchase movement with
 * fresh random ids, which the server has no way to recognise as the same
 * delivery: both were accepted (stock doubled) while one of the two
 * `quantity_received` updates lost the version check, so the PO showed a
 * single receipt.
 *
 * Two changes close it, and this file covers both halves:
 *  - the line's `quantity_received` is re-read inside the transaction (the
 *    pattern `submitStockAudit` already uses for system quantity), which
 *    settles any race within one device;
 *  - the batch and its movement are keyed on a deterministic id derived
 *    from the PO line and its already-received balance, so a second
 *    device's copy of the same receipt carries the same ids and collapses
 *    onto the first server-side rather than doubling it. The server half is
 *    covered by `laravel-server/tests/Feature/SyncPushPurchaseOrderReceiptTest.php`.
 */
describe("receivePurchaseOrder cannot book one delivery twice", () => {
  let db: Database;
  let core: typeof import("@/lib/db/core");
  let createPurchaseOrder: typeof import("@/lib/db/procurement").createPurchaseOrder;
  let getPurchaseOrderById: typeof import("@/lib/db/procurement").getPurchaseOrderById;
  let receivePurchaseOrder: typeof import("@/lib/db/procurement-receiving").receivePurchaseOrder;
  let receiptBatchId: typeof import("@/lib/db/deterministic-id").receiptBatchId;
  let receiptMovementId: typeof import("@/lib/db/deterministic-id").receiptMovementId;

  beforeAll(async () => {
    core = await import("@/lib/db/core");
    ({ createPurchaseOrder, getPurchaseOrderById } = await import("@/lib/db/procurement"));
    ({ receivePurchaseOrder } = await import("@/lib/db/procurement-receiving"));
    ({ receiptBatchId, receiptMovementId } = await import("@/lib/db/deterministic-id"));

    const { SCHEMA_SQL } = await import("@/lib/db/schema");
    const SQL = await initSqlJs({
      locateFile: () => require.resolve("sql.js/dist/sql-wasm.wasm"),
    });
    db = new SQL.Database();
    db.run(SCHEMA_SQL);
    core.__setDatabaseForTesting(db);
  });

  beforeEach(() => {
    db.run(`
      DELETE FROM purchase_orders; DELETE FROM purchase_order_items;
      DELETE FROM products; DELETE FROM stock_batches; DELETE FROM stock_movements;
      DELETE FROM _sync_queue; DELETE FROM audit_logs;
    `);
    db.run(
      `INSERT INTO products (id, name, base_unit, bulk_unit, units_per_bulk)
       VALUES ('prod1', 'Zyrtec', 'Tablet', 'Carton', 10)`,
    );
  });

  async function seedPO() {
    const poId = await createPurchaseOrder(null, "", [
      {
        product_id: "prod1",
        product_name: "Zyrtec",
        bulk_unit: "Carton",
        bulk_quantity: 100,
        units_per_bulk: 10,
        unit_cost: 1000,
        subtotal: 100000,
      },
    ]);
    const po = await getPurchaseOrderById(poId);
    return { poId, itemId: po!.items[0].id };
  }

  function scalar(sql: string): unknown {
    const rows = db.exec(sql);
    return rows.length ? rows[0].values[0][0] : undefined;
  }

  it("books the delivery once when two receipts for the same PO race each other", async () => {
    const { poId, itemId } = await seedPO();

    await Promise.all([
      receivePurchaseOrder(poId, [{ po_item_id: itemId, quantity: 100 }]),
      receivePurchaseOrder(poId, [{ po_item_id: itemId, quantity: 100 }]),
    ]);

    expect(scalar(`SELECT COUNT(*) FROM stock_batches WHERE product_id = 'prod1'`)).toBe(1);
    expect(scalar(`SELECT SUM(quantity) FROM stock_batches WHERE product_id = 'prod1'`)).toBe(1000);
    expect(scalar(`SELECT SUM(quantity) FROM stock_movements WHERE product_id = 'prod1'`)).toBe(1000);
    expect(
      scalar(`SELECT quantity_received FROM purchase_order_items WHERE id = '${itemId}'`),
    ).toBe(100);
  });

  it("re-reads quantity_received inside the transaction, so a receipt staged against a stale balance can't overbook", async () => {
    const { poId, itemId } = await seedPO();

    // First receipt lands.
    await receivePurchaseOrder(poId, [{ po_item_id: itemId, quantity: 100 }]);
    // A second device's receipt, staged while the line still read 0 received
    // and only now reaching the database.
    await receivePurchaseOrder(poId, [{ po_item_id: itemId, quantity: 100 }]);

    expect(scalar(`SELECT SUM(quantity) FROM stock_batches WHERE product_id = 'prod1'`)).toBe(1000);
    expect(
      scalar(`SELECT quantity_received FROM purchase_order_items WHERE id = '${itemId}'`),
    ).toBe(100);
  });

  it("keys the receipt's batch and movement on the PO line and its already-received balance", async () => {
    const { poId, itemId } = await seedPO();

    await receivePurchaseOrder(poId, [{ po_item_id: itemId, quantity: 60 }]);

    expect(scalar(`SELECT id FROM stock_batches WHERE product_id = 'prod1'`)).toBe(
      receiptBatchId(itemId, 0),
    );
    expect(scalar(`SELECT id FROM stock_movements WHERE product_id = 'prod1'`)).toBe(
      receiptMovementId(itemId, 0),
    );
  });

  it("gives a genuine follow-up receipt against the same line its own ids", async () => {
    const { poId, itemId } = await seedPO();

    await receivePurchaseOrder(poId, [{ po_item_id: itemId, quantity: 60 }]);
    await receivePurchaseOrder(poId, [{ po_item_id: itemId, quantity: 40 }]);

    const batchIds = db
      .exec(`SELECT id FROM stock_batches WHERE product_id = 'prod1' ORDER BY id`)[0]
      .values.map((row) => row[0]);

    expect(batchIds).toHaveLength(2);
    expect(new Set(batchIds).size).toBe(2);
    expect(batchIds).toContain(receiptBatchId(itemId, 0));
    expect(batchIds).toContain(receiptBatchId(itemId, 60));
    expect(scalar(`SELECT SUM(quantity) FROM stock_batches WHERE product_id = 'prod1'`)).toBe(1000);
  });

  it("derives a UUID-shaped id that is stable across calls and distinct per input", async () => {
    const { deterministicId } = await import("@/lib/db/deterministic-id");
    const UUID_REGEX =
      /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

    expect(deterministicId("a", "b")).toMatch(UUID_REGEX);
    expect(deterministicId("a", "b")).toBe(deterministicId("a", "b"));
    expect(deterministicId("a", "b")).not.toBe(deterministicId("a", "c"));
    // Separator-injection: ("ab","c") and ("a","bc") must not collide.
    expect(deterministicId("ab", "c")).not.toBe(deterministicId("a", "bc"));
  });

  it("pins the exact ids a fixed PO line and balance derive, across every version of this app", async () => {
    const { deterministicId } = await import("@/lib/db/deterministic-id");
    const PO_ITEM_ID = "3f8a1c2d-5b6e-4f70-9a21-0c4d8e7b1a35";

    expect(receiptBatchId(PO_ITEM_ID, 0)).toBe("5a07acc3-5806-5160-8893-80f9894c2516");
    expect(receiptBatchId(PO_ITEM_ID, 12)).toBe("29123426-e659-55d3-8131-713c50e0c601");
    expect(receiptMovementId(PO_ITEM_ID, 12)).toBe("a0e1898b-ac66-5268-833c-4a393780d6e6");
    expect(deterministicId("po_receipt_batch", PO_ITEM_ID, 12)).toBe(
      "29123426-e659-55d3-8131-713c50e0c601",
    );
  });
});
