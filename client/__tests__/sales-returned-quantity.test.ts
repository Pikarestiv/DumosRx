import { describe, it, expect, beforeAll, beforeEach, vi } from "vitest";
import initSqlJs, { type Database } from "sql.js";

vi.mock("idb-keyval", () => ({
  get: vi.fn(() => Promise.resolve(undefined)),
  set: vi.fn(() => Promise.resolve(undefined)),
}));

// Regression coverage for KNOWN_BUGS.md #1:
// Rationale: docs/CLIENT_COMMENTS.md#block-__tests__-sales-returned-quantity-test-ts-L9
describe("getTransactionDetails returned_quantity", () => {
  let db: Database;
  let core: typeof import("@/lib/db/core");
  let getTransactionDetails: typeof import("@/lib/db/queries/sales").getTransactionDetails;

  beforeAll(async () => {
    core = await import("@/lib/db/core");
    const sales = await import("@/lib/db/queries/sales");
    getTransactionDetails = sales.getTransactionDetails;

    const SQL = await initSqlJs({
      locateFile: () => require.resolve("sql.js/dist/sql-wasm.wasm"),
    });
    db = new SQL.Database();
    db.run(`
      CREATE TABLE sale_items (
        id TEXT PRIMARY KEY, sale_id TEXT, product_id TEXT, quantity INTEGER,
        unit_price REAL, cost_price REAL, created_at TEXT, _deleted INTEGER DEFAULT 0
      );
      CREATE TABLE products (
        id TEXT PRIMARY KEY, name TEXT
      );
      CREATE TABLE returns (
        id TEXT PRIMARY KEY, sale_id TEXT, total_refunded REAL, created_at TEXT,
        _deleted INTEGER DEFAULT 0
      );
      CREATE TABLE return_items (
        id TEXT PRIMARY KEY, return_id TEXT, product_id TEXT, quantity INTEGER,
        _deleted INTEGER DEFAULT 0
      );
    `);
    core.__setDatabaseForTesting(db);
  });

  beforeEach(() => {
    db.run(`DELETE FROM sale_items; DELETE FROM products; DELETE FROM returns; DELETE FROM return_items;`);
  });

  it("reports 0 returned_quantity when nothing has been returned", async () => {
    db.run(`INSERT INTO products (id, name) VALUES ('p1', 'Panadol')`);
    db.run(`INSERT INTO sale_items (id, sale_id, product_id, quantity, unit_price) VALUES ('si1', 'sale1', 'p1', 5, 100)`);

    const { items } = await getTransactionDetails("sale1");

    expect(items[0].returned_quantity).toBe(0);
  });

  it("sums returned_quantity across a single prior return", async () => {
    db.run(`INSERT INTO products (id, name) VALUES ('p1', 'Panadol')`);
    db.run(`INSERT INTO sale_items (id, sale_id, product_id, quantity, unit_price) VALUES ('si1', 'sale1', 'p1', 5, 100)`);
    db.run(`INSERT INTO returns (id, sale_id, total_refunded, created_at) VALUES ('r1', 'sale1', 300, '2026-01-01')`);
    db.run(`INSERT INTO return_items (id, return_id, product_id, quantity) VALUES ('ri1', 'r1', 'p1', 3)`);

    const { items } = await getTransactionDetails("sale1");

    expect(items[0].returned_quantity).toBe(3);
  });

  it("accumulates returned_quantity across multiple separate returns on the same sale", async () => {
    // The exact repro from KNOWN_BUGS.md #1:
    // Rationale: docs/CLIENT_COMMENTS.md#line-__tests__-sales-returned-quantity-test-ts-L76
    db.run(`INSERT INTO products (id, name) VALUES ('p1', 'Panadol')`);
    db.run(`INSERT INTO sale_items (id, sale_id, product_id, quantity, unit_price) VALUES ('si1', 'sale1', 'p1', 5, 100)`);
    db.run(`INSERT INTO returns (id, sale_id, total_refunded, created_at) VALUES
      ('r1', 'sale1', 300, '2026-01-01'), ('r2', 'sale1', 200, '2026-01-02')`);
    db.run(`INSERT INTO return_items (id, return_id, product_id, quantity) VALUES
      ('ri1', 'r1', 'p1', 3), ('ri2', 'r2', 'p1', 2)`);

    const { items } = await getTransactionDetails("sale1");

    expect(items[0].returned_quantity).toBe(5);
  });

  it("excludes soft-deleted return_items from the returned total", async () => {
    db.run(`INSERT INTO products (id, name) VALUES ('p1', 'Panadol')`);
    db.run(`INSERT INTO sale_items (id, sale_id, product_id, quantity, unit_price) VALUES ('si1', 'sale1', 'p1', 5, 100)`);
    db.run(`INSERT INTO returns (id, sale_id, total_refunded, created_at) VALUES ('r1', 'sale1', 300, '2026-01-01')`);
    db.run(`INSERT INTO return_items (id, return_id, product_id, quantity, _deleted) VALUES ('ri1', 'r1', 'p1', 3, 1)`);

    const { items } = await getTransactionDetails("sale1");

    expect(items[0].returned_quantity).toBe(0);
  });

  it("distributes returned_quantity sequentially instead of double-attributing it to every sale_item of the same product", async () => {
    // return_items has no sale_item_id column, so the raw SQL gives every sale_item row for a product the SAME combined return…
    // Rationale: docs/CLIENT_COMMENTS.md#line-__tests__-sales-returned-quantity-test-ts-L103
    db.run(`INSERT INTO products (id, name) VALUES ('p1', 'Panadol')`);
    db.run(`INSERT INTO sale_items (id, sale_id, product_id, quantity, unit_price, created_at) VALUES
      ('si1', 'sale1', 'p1', 5, 100, '2026-01-01T00:00:00Z'),
      ('si2', 'sale1', 'p1', 3, 100, '2026-01-01T00:00:01Z')`);
    db.run(`INSERT INTO returns (id, sale_id, total_refunded, created_at) VALUES ('r1', 'sale1', 400, '2026-01-02')`);
    db.run(`INSERT INTO return_items (id, return_id, product_id, quantity) VALUES ('ri1', 'r1', 'p1', 4)`);

    const { items } = await getTransactionDetails("sale1");

    const bySaleItem = Object.fromEntries(items.map((i) => [i.id, i.returned_quantity]));
    expect(bySaleItem.si1).toBe(4);
    expect(bySaleItem.si2).toBe(0);
    // Combined remaining returnable across both lines matches the true
    // total (8 sold - 4 returned = 4), not the under-counted 1.
    const totalMaxReturnable = items.reduce(
      (sum, i) => sum + Math.max(0, i.quantity - (i.returned_quantity || 0)),
      0,
    );
    expect(totalMaxReturnable).toBe(4);
  });

  it("does not affect a sale where only one sale_item exists per product (the normal POS case)", async () => {
    db.run(`INSERT INTO products (id, name) VALUES ('p1', 'Panadol'), ('p2', 'Amoxicillin')`);
    db.run(`INSERT INTO sale_items (id, sale_id, product_id, quantity, unit_price, created_at) VALUES
      ('si1', 'sale1', 'p1', 5, 100, '2026-01-01T00:00:00Z'),
      ('si2', 'sale1', 'p2', 10, 50, '2026-01-01T00:00:01Z')`);
    db.run(`INSERT INTO returns (id, sale_id, total_refunded, created_at) VALUES ('r1', 'sale1', 300, '2026-01-02')`);
    db.run(`INSERT INTO return_items (id, return_id, product_id, quantity) VALUES ('ri1', 'r1', 'p1', 3)`);

    const { items } = await getTransactionDetails("sale1");
    const bySaleItem = Object.fromEntries(items.map((i) => [i.id, i.returned_quantity]));
    expect(bySaleItem.si1).toBe(3);
    expect(bySaleItem.si2).toBe(0);
  });
});
