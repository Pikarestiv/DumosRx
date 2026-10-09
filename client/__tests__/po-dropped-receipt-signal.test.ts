import { describe, it, expect, beforeAll, beforeEach, vi } from "vitest";
import initSqlJs, { type Database } from "sql.js";

vi.mock("idb-keyval", () => ({
  get: vi.fn(async () => undefined),
  set: vi.fn(async () => undefined),
}));

/**
 * A-26: the A-9 fix deliberately keys a receipt's rows on the PO line plus its
 * already-received balance, so a stale second device's legitimate second
 * partial receipt collapses into the first one and its `quantity_received`
 * UPDATE is dropped server-side as a terminal `version_conflict`. The keying
 * stays; what is fixed is the silence. `_sync_conflicts` records the drop and
 * `getDroppedReceiptSignal()` reports it against the order so the receiving
 * screen can tell the store to re-check the received figure.
 */
describe("dropped-receipt signal for a purchase order", () => {
  let db: Database;
  let core: typeof import("@/lib/db/core");
  let conflictLog: typeof import("@/lib/db/sync-engine/conflict-log");
  let procurement: typeof import("@/lib/db/queries/procurement");

  beforeAll(async () => {
    core = await import("@/lib/db/core");
    conflictLog = await import("@/lib/db/sync-engine/conflict-log");
    procurement = await import("@/lib/db/queries/procurement");

    const { SCHEMA_SQL } = await import("@/lib/db/schema");
    const SQL = await initSqlJs({
      locateFile: () => require.resolve("sql.js/dist/sql-wasm.wasm"),
    });
    db = new SQL.Database();
    db.run(SCHEMA_SQL);
    core.__setDatabaseForTesting(db);
  });

  beforeEach(() => {
    db.run(
      `DELETE FROM purchase_orders; DELETE FROM purchase_order_items; DELETE FROM _sync_conflicts;`,
    );
    core.setActiveStoreId(null);
  });

  const seedOrder = (poId: string, itemIds: string[]) => {
    db.run(
      `INSERT INTO purchase_orders (id, status, _deleted) VALUES (?, 'partially_received', 0)`,
      [poId],
    );
    for (const itemId of itemIds) {
      db.run(
        `INSERT INTO purchase_order_items (id, po_id, product_id, bulk_quantity, quantity_received, units_per_bulk, unit_cost, subtotal, _deleted)
         VALUES (?, ?, 'prod1', 100, 60, 1, 500, 50000, 0)`,
        [itemId, poId],
      );
    }
  };

  const dropReceipt = (itemId: string, fields = { quantity_received: 100, bulk_quantity: 100 }) =>
    conflictLog.recordTerminalConflict({
      table_name: "purchase_order_items",
      record_id: itemId,
      reason: "version_conflict",
      fields: conflictLog.conflictFieldList(fields),
    });

  it("reports nothing for an order that has never had a change dropped", async () => {
    seedOrder("po1", ["item1"]);

    expect(await procurement.getDroppedReceiptSignal("po1")).toBeNull();
  });

  it("reports a dropped quantity_received update against one of the order's lines", async () => {
    seedOrder("po1", ["item1"]);
    await dropReceipt("item1");

    const signal = await procurement.getDroppedReceiptSignal("po1");
    expect(signal?.lineCount).toBe(1);
    expect(signal?.conflictIds).toHaveLength(1);
    expect(signal?.detectedAt).toBeTruthy();
  });

  it("counts distinct lines, not conflict rows, when the same line is dropped twice", async () => {
    seedOrder("po1", ["item1", "item2"]);
    await dropReceipt("item1");
    await dropReceipt("item1");
    await dropReceipt("item2");

    const signal = await procurement.getDroppedReceiptSignal("po1");
    expect(signal?.lineCount).toBe(2);
    expect(signal?.conflictIds).toHaveLength(3);
  });

  it("never reports another order's dropped receipt", async () => {
    seedOrder("po1", ["item1"]);
    seedOrder("po2", ["item2"]);
    await dropReceipt("item2");

    expect(await procurement.getDroppedReceiptSignal("po1")).toBeNull();
    expect((await procurement.getDroppedReceiptSignal("po2"))?.lineCount).toBe(1);
  });

  it("ignores a dropped change that never touched quantity_received", async () => {
    seedOrder("po1", ["item1"]);
    await conflictLog.recordTerminalConflict({
      table_name: "purchase_order_items",
      record_id: "item1",
      reason: "version_conflict",
      fields: conflictLog.conflictFieldList({ unit_cost: 500 }),
    });

    expect(await procurement.getDroppedReceiptSignal("po1")).toBeNull();
  });

  it("stops reporting once the store dismisses the warning", async () => {
    seedOrder("po1", ["item1"]);
    await dropReceipt("item1");
    const signal = await procurement.getDroppedReceiptSignal("po1");

    await procurement.dismissDroppedReceiptSignal(signal!.conflictIds);

    expect(await procurement.getDroppedReceiptSignal("po1")).toBeNull();
  });

  it("stops reporting once a later change to the same line reaches the server", async () => {
    seedOrder("po1", ["item1"]);
    await dropReceipt("item1");

    await conflictLog.resolveConflictsForRecords([
      { table_name: "purchase_order_items", record_id: "item1" },
    ]);

    expect(await procurement.getDroppedReceiptSignal("po1")).toBeNull();
  });

  it("leaves an unrelated line's outstanding signal alone when another line resolves", async () => {
    seedOrder("po1", ["item1", "item2"]);
    await dropReceipt("item1");
    await dropReceipt("item2");

    await conflictLog.resolveConflictsForRecords([
      { table_name: "purchase_order_items", record_id: "item1" },
    ]);

    expect((await procurement.getDroppedReceiptSignal("po1"))?.lineCount).toBe(1);
  });

  it("records other tables too, but keeps them out of the purchase-order signal", async () => {
    // The ledger used to be allowlisted to purchase_order_items so it stayed
    // small; it now logs every table (a terminal drop elsewhere left no trace
    // at all) and is bounded by a row cap instead — see
    // __tests__/conflict-ledger-bounded.test.ts. What must not change is that
    // this reader only ever sees its own table's rows.
    seedOrder("po1", ["item1"]);
    await conflictLog.recordTerminalConflict({
      table_name: "products",
      record_id: "prod1",
      reason: "version_conflict",
      fields: "name",
    });

    expect(await conflictLog.getUnresolvedConflicts("products", ["prod1"])).toHaveLength(1);
    expect(await procurement.getDroppedReceiptSignal("po1")).toBeNull();
  });

  it("treats a conflict with no recorded field list as possibly a receipt, rather than hiding it", async () => {
    seedOrder("po1", ["item1"]);
    await conflictLog.recordTerminalConflict({
      table_name: "purchase_order_items",
      record_id: "item1",
      reason: "version_conflict",
      fields: null,
    });

    expect((await procurement.getDroppedReceiptSignal("po1"))?.lineCount).toBe(1);
  });
});
