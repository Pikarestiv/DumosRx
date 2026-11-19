import { describe, it, expect, beforeAll, beforeEach, vi } from "vitest";
import type { Database } from "sql.js";
import { clearProcurementTables, createProcurementTestDb } from "./helpers/procurement-test-db";
import type { DraftOrderSnapshot } from "@/lib/db/procurement-draft";

vi.mock("idb-keyval", () => ({
  get: vi.fn(() => Promise.resolve(undefined)),
  set: vi.fn(() => Promise.resolve(undefined)),
}));

describe("draft order lock", () => {
  let db: Database;
  let draft: typeof import("@/lib/db/procurement-draft");
  const rows = (sql: string) => db.exec(sql)[0]?.values ?? [];
  const mine = { deviceId: "DRX-MINE", deviceLabel: "Counter 1", userId: "u1" };
  const snapshot = (quantity: number, overrides: Partial<DraftOrderSnapshot> = {}): DraftOrderSnapshot => ({
    id: "po1", supplierId: null, notes: "", paymentStatus: "unpaid", amountPaid: 0, dueDate: null, lock: mine,
    items: [{ id: "l1", product_id: "p1", product_name: "P", bulk_unit: "Box", bulk_quantity: quantity, units_per_bulk: 10, unit_cost: 100, subtotal: 0 }],
    ...overrides,
  });
  const lockedBy = (deviceId: string, minutesAgo: number) =>
    db.run(`UPDATE purchase_orders SET editing_device_id = ?, editing_device_label = 'Counter 2', editing_at = ? WHERE id = 'po1'`,
      [deviceId, new Date(Date.now() - minutesAgo * 60_000).toISOString()]);

  beforeAll(async () => {
    draft = await import("@/lib/db/procurement-draft");
    db = await createProcurementTestDb();
  });

  beforeEach(() => {
    clearProcurementTables(db);
    db.run("DELETE FROM audit_logs; DELETE FROM _sync_queue;");
  });

  it("stamps this till as the editor on every save", async () => {
    await draft.saveDraftOrder(snapshot(1));
    expect(rows("SELECT editing_device_id, editing_device_label, editing_user_id FROM purchase_orders")).toEqual([["DRX-MINE", "Counter 1", "u1"]]);
    expect(rows("SELECT editing_at IS NOT NULL FROM purchase_orders")[0][0]).toBe(1);
  });

  it("refuses to save over an order another till is editing right now", async () => {
    await draft.saveDraftOrder(snapshot(1));
    lockedBy("DRX-OTHER", 2);

    const result = await draft.saveDraftOrder(snapshot(5));

    expect(result.outcome).toBe("locked");
    expect(rows("SELECT bulk_quantity FROM purchase_order_items")[0][0]).toBe(1);
    expect(rows("SELECT editing_device_id FROM purchase_orders")[0][0]).toBe("DRX-OTHER");
  });

  it("lets a till save once the other till's lock has gone stale", async () => {
    await draft.saveDraftOrder(snapshot(1));
    lockedBy("DRX-OTHER", 11);

    expect((await draft.saveDraftOrder(snapshot(5))).outcome).toBe("updated");
    expect(rows("SELECT editing_device_id FROM purchase_orders")[0][0]).toBe("DRX-MINE");
  });

  it("takes over a fresh lock only when asked to", async () => {
    await draft.saveDraftOrder(snapshot(1));
    lockedBy("DRX-OTHER", 1);

    expect((await draft.saveDraftOrder(snapshot(5, { takeOver: true }))).outcome).toBe("updated");
    expect(rows("SELECT editing_device_id, bulk_quantity FROM purchase_orders, purchase_order_items")).toEqual([["DRX-MINE", 5]]);
  });

  it("treats an order no till has locked, as older tills leave it, as open", async () => {
    await draft.saveDraftOrder(snapshot(1));
    db.run("UPDATE purchase_orders SET editing_device_id = NULL, editing_at = NULL");
    expect((await draft.saveDraftOrder(snapshot(2))).outcome).toBe("updated");
  });

  it("reports who holds a fresh lock, and nobody once it is stale or released", async () => {
    await draft.saveDraftOrder(snapshot(1));
    lockedBy("DRX-OTHER", 3);
    expect(draft.lockHeldByAnother({ editing_device_id: "DRX-OTHER", editing_at: rows("SELECT editing_at FROM purchase_orders")[0][0] as string }, "DRX-MINE", new Date()))
      .toBe(true);
    expect(draft.lockHeldByAnother({ editing_device_id: "DRX-MINE", editing_at: new Date().toISOString() }, "DRX-MINE", new Date())).toBe(false);
    expect(draft.lockHeldByAnother({ editing_device_id: "DRX-OTHER", editing_at: "2026-01-01T00:00:00Z" }, "DRX-MINE", new Date())).toBe(false);

    await draft.releaseDraftLock("po1", "DRX-OTHER");
    expect(rows("SELECT editing_device_id FROM purchase_orders")[0][0]).toBeNull();
  });

  it("does not release a lock another till has taken since", async () => {
    await draft.saveDraftOrder(snapshot(1));
    lockedBy("DRX-OTHER", 1);
    await draft.releaseDraftLock("po1", "DRX-MINE");
    expect(rows("SELECT editing_device_id FROM purchase_orders")[0][0]).toBe("DRX-OTHER");
  });

  it("refreshes only this till's own lock, without an audit row, and leaves another till's lock alone", async () => {
    await draft.saveDraftOrder(snapshot(1));
    db.run("UPDATE purchase_orders SET editing_at = '2026-01-01T00:00:00.000Z'");
    db.run("DELETE FROM audit_logs");

    expect(await draft.refreshDraftLock("po1", mine)).toBe(true);
    expect(rows("SELECT editing_at > '2026-01-01T00:00:00.000Z' FROM purchase_orders")[0][0]).toBe(1);
    expect(rows("SELECT COUNT(*) FROM audit_logs")[0][0]).toBe(0);

    lockedBy("DRX-OTHER", 2);
    const theirs = rows("SELECT editing_at FROM purchase_orders")[0][0];
    expect(await draft.refreshDraftLock("po1", mine)).toBe(false);
    expect(rows("SELECT editing_device_id, editing_at FROM purchase_orders")[0]).toEqual(["DRX-OTHER", theirs]);
  });

  it("does not refresh a lock on an order that is no longer a draft", async () => {
    await draft.saveDraftOrder(snapshot(1));
    db.run("UPDATE purchase_orders SET status = 'received', editing_at = '2026-01-01T00:00:00.000Z'");

    expect(await draft.refreshDraftLock("po1", mine)).toBe(false);
    expect(rows("SELECT editing_at FROM purchase_orders")[0][0]).toBe("2026-01-01T00:00:00.000Z");
  });
});
