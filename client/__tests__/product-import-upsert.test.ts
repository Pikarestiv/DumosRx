import { describe, it, expect, beforeAll, beforeEach, vi } from "vitest";
import initSqlJs, { type Database } from "sql.js";

vi.mock("idb-keyval", () => ({
  get: vi.fn(async () => undefined),
  set: vi.fn(async () => undefined),
}));

describe("importProductRows", () => {
  let db: Database;
  let core: typeof import("@/lib/db/core");
  let importProductRows: typeof import("@/lib/db/queries/product-import").importProductRows;

  beforeAll(async () => {
    core = await import("@/lib/db/core");
    ({ importProductRows } = await import("@/lib/db/queries/product-import"));

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
      DELETE FROM products; DELETE FROM categories; DELETE FROM suppliers;
      DELETE FROM stock_batches; DELETE FROM _sync_queue;
    `);
  });

  it("creates a new product plus one opening-stock batch, and resolves/creates its category and supplier", async () => {
    const result = await importProductRows([
      {
        name: "CYPRI GOLD SMALL SYRUP",
        category: "DRUGS",
        supplier: "System",
        costPrice: 249.91,
        sellingPrice: 1000,
        quantity: 3,
        barcode: "114",
      },
    ]);

    expect(result).toEqual({ created: 1, updated: 0, skipped: [] });

    const products = db.exec(
      `SELECT p.name, p.selling_price, p.barcode, c.name as category_name
       FROM products p LEFT JOIN categories c ON c.id = p.category_id`,
    );
    expect(products[0].values[0]).toEqual([
      "CYPRI GOLD SMALL SYRUP",
      1000,
      "114",
      "DRUGS",
    ]);

    const batches = db.exec(
      `SELECT sb.quantity, sb.cost_price, sb.batch_number, sb.expiry_date, s.name as supplier_name
       FROM stock_batches sb LEFT JOIN suppliers s ON s.id = sb.supplier_id`,
    );
    expect(batches[0].values[0]).toEqual([3, 249.91, null, null, "System"]);
  });

  it("updates an existing product matched by barcode without creating a second batch", async () => {
    db.run(
      `INSERT INTO products (id, name, barcode, selling_price, _deleted) VALUES ('p1', 'OLD NAME', '114', 500, 0)`,
    );
    db.run(
      `INSERT INTO stock_batches (id, product_id, quantity, _deleted, is_active) VALUES ('b1', 'p1', 10, 0, 1)`,
    );

    const result = await importProductRows([
      { name: "CYPRI GOLD SMALL SYRUP", sellingPrice: 1000, quantity: 3, barcode: "114" },
    ]);

    expect(result).toEqual({ created: 0, updated: 1, skipped: [] });

    const products = db.exec(`SELECT name, selling_price FROM products WHERE id = 'p1'`);
    expect(products[0].values[0]).toEqual(["CYPRI GOLD SMALL SYRUP", 1000]);

    const batchCount = db.exec(`SELECT COUNT(*) FROM stock_batches WHERE product_id = 'p1'`);
    expect(batchCount[0].values[0][0]).toBe(1); // still just the original batch
  });

  it("treats the same name in different categories as distinct products", async () => {
    db.run(`INSERT INTO categories (id, name, _deleted) VALUES ('c1', 'DRUGS', 0)`);
    db.run(
      `INSERT INTO products (id, name, category_id, _deleted) VALUES ('p1', 'PARACETAMOL', 'c1', 0)`,
    );

    const result = await importProductRows([
      { name: "PARACETAMOL", category: "OTC", quantity: 5 },
    ]);

    expect(result.created).toBe(1);
    const count = db.exec(`SELECT COUNT(*) FROM products WHERE name = 'PARACETAMOL'`);
    expect(count[0].values[0][0]).toBe(2);
  });

  it("reports a skipped row without throwing when the name is blank", async () => {
    const result = await importProductRows([{ name: "" }]);
    expect(result).toEqual({
      created: 0,
      updated: 0,
      skipped: [{ row: 0, reason: "Missing product name" }],
    });
  });
});
