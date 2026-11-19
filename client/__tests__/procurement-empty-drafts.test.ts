import { describe, it, expect, beforeAll, beforeEach, vi } from "vitest";
import type { Database } from "sql.js";
import { clearProcurementTables, createProcurementTestDb } from "./helpers/procurement-test-db";

vi.mock("idb-keyval", () => ({
  get: vi.fn(() => Promise.resolve(undefined)),
  set: vi.fn(() => Promise.resolve(undefined)),
}));

describe("clearing out empty drafts", () => {
  let db: Database;
  let removeEmptyDraftsOf: typeof import("@/lib/db/procurement-empty-drafts").removeEmptyDraftsOf;
  const now = new Date("2026-11-19T12:00:00Z");
  const old = "2026-11-19T09:00:00Z";
  const recent = "2026-11-19T11:55:00Z";

  beforeAll(async () => {
    ({ removeEmptyDraftsOf } = await import("@/lib/db/procurement-empty-drafts"));
    db = await createProcurementTestDb();
  });

  beforeEach(() => clearProcurementTables(db));

  const order = (id: string, fields: { status?: string; by?: string; notes?: string | null; paid?: number; at?: string } = {}) =>
    db.run(
      `INSERT INTO purchase_orders (id, status, type, ordered_by, notes, amount_paid, total_amount, created_at, updated_at, _deleted)
       VALUES (?, ?, 'immediate', ?, ?, ?, 0, ?, ?, 0)`,
      [id, fields.status ?? "pending", fields.by ?? "u1", fields.notes ?? null, fields.paid ?? 0, fields.at ?? old, fields.at ?? old],
    );
  const live = () => (db.exec("SELECT id FROM purchase_orders WHERE _deleted = 0 ORDER BY id")[0]?.values ?? []).map((r) => r[0]);

  it("deletes only this user's old, empty, untouched drafts", async () => {
    order("a-empty");
    order("b-items");
    db.run(`INSERT INTO purchase_order_items (id, po_id, product_id, bulk_quantity, units_per_bulk, unit_cost, subtotal, _deleted) VALUES ('l1', 'b-items', 'p1', 0, 1, 0, 0, 0)`);
    order("c-notes", { notes: "call Emzor" });
    order("d-paid", { paid: 500 });
    order("e-recent", { at: recent });
    order("f-other-user", { by: "u2" });
    order("g-sent", { status: "sent" });
    order("h-whitespace-notes", { notes: "   " });

    const removed = await removeEmptyDraftsOf("u1", now);

    expect(removed).toBe(2);
    expect(live()).toEqual(["b-items", "c-notes", "d-paid", "e-recent", "f-other-user", "g-sent"]);
  });

  it("counts a draft whose every line was removed as empty", async () => {
    order("a-emptied");
    db.run(`INSERT INTO purchase_order_items (id, po_id, product_id, bulk_quantity, units_per_bulk, unit_cost, subtotal, _deleted) VALUES ('l1', 'a-emptied', 'p1', 2, 1, 5, 10, 1)`);

    await removeEmptyDraftsOf("u1", now);

    expect(live()).toEqual([]);
  });

  it("does nothing without a signed-in user", async () => {
    order("a-empty");
    expect(await removeEmptyDraftsOf(null, now)).toBe(0);
    expect(live()).toEqual(["a-empty"]);
  });
});
