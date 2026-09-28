import { describe, it, expect, beforeAll, beforeEach, vi } from "vitest";
import initSqlJs, { type Database } from "sql.js";

vi.mock("idb-keyval", () => ({
  get: vi.fn(async () => undefined),
  set: vi.fn(async () => undefined),
}));

/**
 * A-16. createPrescription() inserted the prescription header and then
 * looped its items through separate insert() calls, and createProduct()
 * created a missing category as its own committed write before inserting
 * the product. Each insert() opens and commits its own transaction, so an
 * interruption between two of them (iOS backgrounding a PWA is called out
 * elsewhere in this codebase as aggressive about killing mid-write) left a
 * prescription with no medications — already queued for sync, so the gap
 * propagated to every other device — or an orphan category with no product.
 *
 * Both are now one transaction(), like createSale/receivePurchaseOrder.
 * A failing insert stands in for the interruption here: the observable
 * requirement is the same either way — nothing of a half-finished
 * multi-row write may survive.
 */
describe("createPrescription/createProduct are atomic", () => {
  let db: Database;
  let core: typeof import("@/lib/db/core");
  let createPrescription: typeof import("@/lib/db/local-database").createPrescription;
  let createProduct: typeof import("@/lib/db/local-database").createProduct;

  beforeAll(async () => {
    core = await import("@/lib/db/core");
    const localDatabase = await import("@/lib/db/local-database");
    createPrescription = localDatabase.createPrescription;
    createProduct = localDatabase.createProduct;

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
      DELETE FROM prescriptions; DELETE FROM prescription_items;
      DELETE FROM products; DELETE FROM categories;
      DELETE FROM _sync_queue; DELETE FROM audit_logs;
    `);
  });

  function count(table: string): number {
    const rows = db.exec(`SELECT COUNT(*) FROM ${table}`);
    return rows[0].values[0][0] as number;
  }

  it("writes a prescription and all of its items, or neither", async () => {
    await expect(
      createPrescription({ patient_name: "Ada Obi", status: "pending" }, [
        { id: "pi-1", product_name: "Panadol", dosage: "1 tab", quantity: 10 },
        // Second item can't be written (no such column) — the header and the
        // first item must not survive on their own.
        { product_name: "Flagyl", not_a_real_column: "boom" } as never,
      ]),
    ).rejects.toThrow();

    expect(count("prescriptions")).toBe(0);
    expect(count("prescription_items")).toBe(0);
  });

  it("leaves no prescription queued for sync when its items could not be written", async () => {
    await expect(
      createPrescription({ patient_name: "Ada Obi", status: "pending" }, [
        { product_name: "Panadol", not_a_real_column: "boom" } as never,
      ]),
    ).rejects.toThrow();

    const queued = db.exec(
      `SELECT COUNT(*) FROM _sync_queue WHERE table_name IN ('prescriptions', 'prescription_items')`,
    );
    expect(queued[0].values[0][0]).toBe(0);
  });

  it("still writes a prescription and its items on the happy path", async () => {
    const id = await createPrescription(
      { patient_name: "Ada Obi", status: "pending" },
      [
        { id: "pi-1", product_name: "Panadol", dosage: "1 tab", quantity: 10 },
        { id: "pi-2", product_name: "Flagyl", dosage: "2 tabs", quantity: 5 },
      ],
    );

    expect(count("prescriptions")).toBe(1);
    const items = db.exec(
      `SELECT prescription_id FROM prescription_items ORDER BY product_name`,
    );
    expect(items[0].values.map((row) => row[0])).toEqual([id, id]);
  });

  it("does not leave an orphan category behind when the product it was created for cannot be written", async () => {
    await expect(
      createProduct({
        name: "Panadol Extra",
        category_id: "Analgesics",
        not_a_real_column: "boom",
      } as never),
    ).rejects.toThrow();

    expect(count("categories")).toBe(0);
    expect(count("products")).toBe(0);
  });

  it("still creates the category and the product on the happy path", async () => {
    const productId = await createProduct({
      name: "Panadol Extra",
      category_id: "Analgesics",
    } as never);

    const categories = db.exec(`SELECT id, name FROM categories`);
    expect(categories[0].values).toHaveLength(1);
    const categoryId = categories[0].values[0][0];
    expect(categories[0].values[0][1]).toBe("analgesics");

    const product = db.exec(
      `SELECT category_id FROM products WHERE id = '${productId}'`,
    );
    expect(product[0].values[0][0]).toBe(categoryId);
  });
});
