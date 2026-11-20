import { describe, it, expect, beforeAll, beforeEach, vi } from "vitest";
import type { Database } from "sql.js";
import { clearProcurementTables, createProcurementTestDb } from "./helpers/procurement-test-db";
import type { DraftOrderSnapshot } from "@/lib/db/procurement-draft";

vi.mock("idb-keyval", () => ({
  get: vi.fn(() => Promise.resolve(undefined)),
  set: vi.fn(() => Promise.resolve(undefined)),
}));

describe("saveDraftOrder", () => {
  let db: Database;
  let saveDraftOrder: typeof import("@/lib/db/procurement-draft").saveDraftOrder;

  beforeAll(async () => {
    ({ saveDraftOrder } = await import("@/lib/db/procurement-draft"));
    db = await createProcurementTestDb();
  });

  beforeEach(() => {
    clearProcurementTables(db);
    db.run("DELETE FROM audit_logs");
    db.run(`INSERT INTO products (id, name, base_unit, bulk_unit, units_per_bulk) VALUES ('p1', 'Panadol', 'Tablet', 'Carton', 10), ('p2', 'Amoxil', 'Capsule', 'Box', 20)`);
  });

  const line = (id: string, productId: string, bulk_quantity: number) => ({
    id, product_id: productId, product_name: productId, bulk_unit: "Carton",
    bulk_quantity, units_per_bulk: 10, unit_cost: 100, subtotal: 0,
  });
  const snapshot = (overrides: Partial<DraftOrderSnapshot> = {}): DraftOrderSnapshot => ({
    id: "po-auto", supplierId: null, notes: "", paymentStatus: "unpaid", amountPaid: 0, dueDate: null,
    items: [line("l1", "p1", 2)], ...overrides,
  });
  const rows = (sql: string) => db.exec(sql)[0]?.values ?? [];

  it("writes nothing until the order has an item", async () => {
    expect((await saveDraftOrder(snapshot({ items: [], notes: "typed" }))).outcome).toBe("unchanged");
    expect(rows("SELECT COUNT(*) FROM purchase_orders")[0][0]).toBe(0);
  });

  it("creates the draft under the id chosen on screen, keeping each line's own id", async () => {
    expect((await saveDraftOrder(snapshot())).outcome).toBe("created");
    expect(rows("SELECT id, status, type, total_amount FROM purchase_orders")).toEqual([["po-auto", "pending", "immediate", 200]]);
    expect(rows("SELECT id, po_id, bulk_quantity FROM purchase_order_items")).toEqual([["l1", "po-auto", 2]]);
  });

  it("rewrites only the line that changed and leaves an untouched header alone", async () => {
    await saveDraftOrder(snapshot({ items: [line("l1", "p1", 2), line("l2", "p2", 1)] }));
    db.run("DELETE FROM _sync_queue");

    await saveDraftOrder(snapshot({ items: [line("l1", "p1", 2), line("l2", "p2", 1)] }));
    expect(rows("SELECT COUNT(*) FROM _sync_queue")[0][0]).toBe(0);

    await saveDraftOrder(snapshot({ items: [line("l1", "p1", 5), line("l2", "p2", 1)] }));
    const queued = rows("SELECT table_name, record_id, payload FROM _sync_queue WHERE table_name != 'audit_logs' ORDER BY table_name");
    expect(queued.map(([table, record]) => [table, record])).toEqual([["purchase_order_items", "l1"], ["purchase_orders", "po-auto"]]);
    expect(JSON.parse(queued[0][2] as string)).toMatchObject({ bulk_quantity: 5, units_per_bulk: 10 });
  });

  it("logs one created entry and one coalesced edit entry, however many saves an editing session makes", async () => {
    await saveDraftOrder(snapshot());
    for (let qty = 3; qty <= 8; qty++) {
      await saveDraftOrder(snapshot({ items: [line("l1", "p1", qty), line("l2", "p2", qty)] }));
    }

    const audit = rows("SELECT action, table_name, occurrence_count FROM audit_logs ORDER BY created_at");
    expect(audit).toEqual([["INSERT", "purchase_orders", 1], ["PO_DRAFT_EDITED", "purchase_orders", 6]]);
  });

  it("refuses to overwrite an order another till has received or deleted", async () => {
    await saveDraftOrder(snapshot());
    db.run("UPDATE purchase_orders SET status = 'received' WHERE id = 'po-auto'");
    expect((await saveDraftOrder(snapshot({ items: [line("l1", "p1", 9)] }))).outcome).toBe("not_editable");

    db.run("UPDATE purchase_orders SET status = 'pending', _deleted = 1 WHERE id = 'po-auto'");
    expect((await saveDraftOrder(snapshot({ items: [line("l1", "p1", 9)] }))).outcome).toBe("deleted");
    expect(rows("SELECT bulk_quantity FROM purchase_order_items WHERE id = 'l1'")[0][0]).toBe(2);
  });

  it("removes a deleted line and adds a new one without touching the rest", async () => {
    await saveDraftOrder(snapshot({ items: [line("l1", "p1", 2), line("l2", "p2", 1)] }));

    await saveDraftOrder(snapshot({ items: [line("l2", "p2", 1), line("l3", "p1", 4)] }));

    expect(rows("SELECT id, _deleted FROM purchase_order_items ORDER BY id")).toEqual([["l1", 1], ["l2", 0], ["l3", 0]]);
  });

  it("reports a new id for a line whose id another till already removed, so the screen stops reusing it", async () => {
    await saveDraftOrder(snapshot());
    db.run("UPDATE purchase_order_items SET _deleted = 1 WHERE id = 'l1'");

    const { lineIdMap } = await saveDraftOrder(snapshot({ items: [line("l1", "p1", 3)] }));

    const newId = lineIdMap.get("l1");
    expect(newId).toBeTruthy();
    expect(rows(`SELECT bulk_quantity FROM purchase_order_items WHERE id = '${newId}' AND _deleted = 0`)[0][0]).toBe(3);
  });
});
