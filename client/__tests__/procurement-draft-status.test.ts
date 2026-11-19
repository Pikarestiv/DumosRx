import { describe, it, expect, beforeAll, beforeEach, vi } from "vitest";
import type { Database } from "sql.js";
import { clearProcurementTables, createProcurementTestDb } from "./helpers/procurement-test-db";

vi.mock("idb-keyval", () => ({
  get: vi.fn(() => Promise.resolve(undefined)),
  set: vi.fn(() => Promise.resolve(undefined)),
}));

describe("draft order status queries", () => {
  let db: Database;
  let status: typeof import("@/lib/db/queries/procurement-draft-status");

  beforeAll(async () => {
    status = await import("@/lib/db/queries/procurement-draft-status");
    db = await createProcurementTestDb();
  });

  beforeEach(() => {
    clearProcurementTables(db);
    db.run("DELETE FROM _sync_queue; DELETE FROM _sync_conflicts;");
    db.run(`INSERT INTO suppliers (id, name) VALUES ('s1', 'Emzor')`);
    db.run(`INSERT INTO purchase_orders (id, supplier_id, status, ordered_by, created_at, updated_at, _deleted) VALUES
      ('po1', 's1', 'pending', 'u1', '2026-11-18T08:00:00.000Z', '2026-11-18T09:00:00.000Z', 0)`);
    db.run(`INSERT INTO purchase_order_items (id, po_id, product_id, bulk_quantity, units_per_bulk, unit_cost, subtotal, _deleted) VALUES
      ('i1', 'po1', 'p1', 2, 10, 100, 200, 0), ('i2', 'po1', 'p2', 1, 10, 100, 100, 0)`);
  });

  it("reports an order as synced only when neither it nor any of its lines is still queued", async () => {
    expect((await status.getOrderSyncState("po1")).pendingWrites).toBe(0);
    db.run(`INSERT INTO _sync_queue (table_name, record_id, operation, payload) VALUES ('purchase_order_items', 'i2', 'UPDATE', '{}')`);
    expect((await status.getOrderSyncState("po1")).pendingWrites).toBe(1);
  });

  it("surfaces an unresolved edit the server refused on the order or a line, but not a settled one", async () => {
    db.run(`INSERT INTO _sync_conflicts (table_name, record_id, reason, detected_at, resolved_at) VALUES
      ('purchase_order_items', 'i1', 'version_conflict', '2026-11-18T10:00:00Z', NULL),
      ('purchase_orders', 'po1', 'version_conflict', '2026-11-18T10:01:00Z', '2026-11-18T10:05:00Z'),
      ('purchase_order_items', 'other', 'version_conflict', '2026-11-18T10:02:00Z', NULL)`);

    const { conflicts } = await status.getOrderSyncState("po1");
    expect(conflicts.map((c) => c.record_id)).toEqual(["i1"]);
  });

  it("offers this user's most recent draft with items from the last 24 hours", async () => {
    db.run(`INSERT INTO purchase_orders (id, status, ordered_by, created_at, updated_at, _deleted) VALUES
      ('old', 'pending', 'u1', '2026-11-16T08:00:00.000Z', '2026-11-16T08:00:00.000Z', 0),
      ('empty', 'pending', 'u1', '2026-11-18T09:30:00.000Z', '2026-11-18T09:30:00.000Z', 0),
      ('theirs', 'pending', 'u2', '2026-11-18T09:40:00.000Z', '2026-11-18T09:40:00.000Z', 0),
      ('sent', 'sent', 'u1', '2026-11-18T09:50:00.000Z', '2026-11-18T09:50:00.000Z', 0)`);

    const draft = await status.getRecentDraftForUser("u1", "2026-11-17T10:00:00.000Z");

    expect(draft).toMatchObject({ id: "po1", vendor_name: "Emzor", item_count: 2, updated_at: "2026-11-18T09:00:00.000Z" });
  });

  it("offers nothing when there is no recent draft", async () => {
    expect(await status.getRecentDraftForUser("u1", "2026-11-19T00:00:00.000Z")).toBeNull();
    expect(await status.getRecentDraftForUser("nobody", "2026-11-17T00:00:00.000Z")).toBeNull();
  });
});
