import { describe, it, expect, beforeAll, beforeEach, vi } from "vitest";
import initSqlJs, { type Database } from "sql.js";

vi.mock("idb-keyval", () => ({
  get: vi.fn(async () => undefined),
  set: vi.fn(async () => undefined),
}));

/**
 * deleteSupplier() mirrors deleteCustomer(): a soft delete, blocked only by
 * money still owed. Order history is deliberately not a blocker — every
 * purchase-order and stock-batch query LEFT JOINs `suppliers` without a
 * `_deleted = 0` filter, so a deleted vendor's name still resolves on the
 * orders it already fulfilled. See client/AGENTS.md ("Deleting a supplier").
 */
describe("deleteSupplier", () => {
  let db: Database;
  let core: typeof import("@/lib/db/core");
  let procurement: typeof import("@/lib/db/procurement");

  beforeAll(async () => {
    core = await import("@/lib/db/core");
    procurement = await import("@/lib/db/procurement");

    const { SCHEMA_SQL } = await import("@/lib/db/schema");
    const SQL = await initSqlJs({
      locateFile: () => require.resolve("sql.js/dist/sql-wasm.wasm"),
    });
    db = new SQL.Database();
    db.run(SCHEMA_SQL);
    core.__setDatabaseForTesting(db);
  });

  beforeEach(() => {
    db.run(`DELETE FROM suppliers; DELETE FROM purchase_orders;`);
    core.setActiveStoreId(null);
  });

  const seedSupplier = (id = "v1") => {
    db.run(
      `INSERT INTO suppliers (id, name, is_active, _deleted) VALUES (?, ?, 1, 0)`,
      [id, `Vendor ${id}`],
    );
  };

  const seedOrder = (
    supplierId: string,
    { total, paid, paymentStatus }: { total: number; paid: number; paymentStatus: string },
  ) => {
    db.run(
      `INSERT INTO purchase_orders (id, supplier_id, status, payment_status, total_amount, amount_paid, _deleted)
       VALUES (?, ?, 'received', ?, ?, ?, 0)`,
      [`po-${supplierId}-${paymentStatus}`, supplierId, paymentStatus, total, paid],
    );
  };

  const isDeleted = (id: string) => {
    const res = db.exec(`SELECT _deleted FROM suppliers WHERE id = '${id}'`);
    return res[0]?.values[0]?.[0] === 1;
  };

  it("reports the outstanding balance across unpaid purchase orders", async () => {
    seedSupplier();
    seedOrder("v1", { total: 1000, paid: 400, paymentStatus: "partial" });
    expect(await procurement.getSupplierOutstandingBalance("v1")).toBe(600);
  });

  it("ignores fully paid orders when totalling what is owed", async () => {
    seedSupplier();
    seedOrder("v1", { total: 1000, paid: 1000, paymentStatus: "paid" });
    expect(await procurement.getSupplierOutstandingBalance("v1")).toBe(0);
  });

  it("counts an order with a NULL payment status as unpaid", async () => {
    seedSupplier();
    db.run(
      `INSERT INTO purchase_orders (id, supplier_id, status, payment_status, total_amount, amount_paid, _deleted)
       VALUES ('po-null', 'v1', 'received', NULL, 1000, 250, 0)`,
    );
    expect(await procurement.getSupplierOutstandingBalance("v1")).toBe(750);
  });

  it("counts a NULL-payment-status order in the directory's owed total", async () => {
    seedSupplier();
    db.run(
      `INSERT INTO purchase_orders (id, supplier_id, status, payment_status, total_amount, amount_paid, _deleted)
       VALUES ('po-null', 'v1', 'received', NULL, 1000, 250, 0)`,
    );
    const { data } = await procurement.getSuppliers();
    expect(data.find((s) => s.id === "v1")?.total_debt).toBe(750);
  });

  it("refuses to delete a supplier owed money on a NULL-payment-status order", async () => {
    seedSupplier();
    db.run(
      `INSERT INTO purchase_orders (id, supplier_id, status, payment_status, total_amount, amount_paid, _deleted)
       VALUES ('po-null', 'v1', 'received', NULL, 1000, 0, 0)`,
    );
    await expect(procurement.deleteSupplier("v1")).rejects.toThrow(/owed|balance/i);
    expect(isDeleted("v1")).toBe(false);
  });

  it("refuses to delete a supplier that is still owed money", async () => {
    seedSupplier();
    seedOrder("v1", { total: 1000, paid: 0, paymentStatus: "unpaid" });
    await expect(procurement.deleteSupplier("v1")).rejects.toThrow(/owed|balance/i);
    expect(isDeleted("v1")).toBe(false);
  });

  it("soft-deletes a supplier with nothing outstanding", async () => {
    seedSupplier();
    await procurement.deleteSupplier("v1");
    expect(isDeleted("v1")).toBe(true);
  });

  it("does not treat settled order history as a blocker", async () => {
    seedSupplier();
    seedOrder("v1", { total: 1000, paid: 1000, paymentStatus: "paid" });
    await procurement.deleteSupplier("v1");
    expect(isDeleted("v1")).toBe(true);
  });

  it("leaves the supplier out of the directory query once deleted", async () => {
    seedSupplier();
    await procurement.deleteSupplier("v1");
    const { data } = await procurement.getSuppliers();
    expect(data.find((s) => s.id === "v1")).toBeUndefined();
  });
});
