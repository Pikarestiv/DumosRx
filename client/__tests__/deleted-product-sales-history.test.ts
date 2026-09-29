import { describe, it, expect, beforeAll, beforeEach, vi } from "vitest";
import initSqlJs, { type Database } from "sql.js";

vi.mock("idb-keyval", () => ({
  get: vi.fn(async () => undefined),
  set: vi.fn(async () => undefined),
}));

/**
 * Pins the load-bearing ABSENCE of a `_deleted = 0` filter on the `products`
 * joins in sales.ts and customers.ts, documented in client/AGENTS.md ("The
 * deactivate-vs-delete design"). A receipt, a transaction list or a customer's
 * purchase history must still name a product that has since been deleted;
 * filtering the join blanks the name or drops the line entirely, and every
 * test here goes red when that filter is added.
 */
describe("sales history survives a product delete", () => {
  let db: Database;
  let core: typeof import("@/lib/db/core");
  let sales: typeof import("@/lib/db/queries/sales");
  let customers: typeof import("@/lib/db/queries/customers");
  let products: typeof import("@/lib/db/queries/products");

  const SALE_DAY = "2026-09-01";
  const saleInstant = new Date(2026, 8, 1, 10, 0, 0, 0).toISOString();

  beforeAll(async () => {
    core = await import("@/lib/db/core");
    sales = await import("@/lib/db/queries/sales");
    customers = await import("@/lib/db/queries/customers");
    products = await import("@/lib/db/queries/products");

    const { SCHEMA_SQL } = await import("@/lib/db/schema");
    const SQL = await initSqlJs({
      locateFile: () => require.resolve("sql.js/dist/sql-wasm.wasm"),
    });
    db = new SQL.Database();
    db.run(SCHEMA_SQL);
    const { runSchemaMigrations, makeSqlJsAdapter } = await import("@/lib/db/schema-migrations");
    await runSchemaMigrations(makeSqlJsAdapter(db));
    core.__setDatabaseForTesting(db);
  });

  beforeEach(async () => {
    db.run(
      `DELETE FROM products; DELETE FROM categories; DELETE FROM sales; DELETE FROM sale_items;
       DELETE FROM stock_batches; DELETE FROM purchase_orders; DELETE FROM purchase_order_items;
       DELETE FROM returns; DELETE FROM return_items; DELETE FROM customers; DELETE FROM users;
       DELETE FROM _sync_queue;`,
    );
    core.setActiveStoreId(null);

    db.run(
      `INSERT INTO products (id, name, selling_price, is_active, _deleted)
       VALUES ('p1', 'Amoxicillin 500mg', 100, 1, 0)`,
    );
    db.run(
      `INSERT INTO customers (id, first_name, last_name, _deleted)
       VALUES ('cust1', 'Ada', 'Obi', 0)`,
    );
    db.run(
      `INSERT INTO sales (id, transaction_number, customer_id, subtotal, total_amount, transaction_date, created_at, _deleted)
       VALUES ('s1', 'TXN-1', 'cust1', 300, 300, ?, ?, 0)`,
      [saleInstant, saleInstant],
    );
    db.run(
      `INSERT INTO sale_items (id, sale_id, product_id, quantity, unit_price, cost_price, total_price, created_at, _deleted)
       VALUES ('si1', 's1', 'p1', 3, 100, 60, 300, ?, 0)`,
      [saleInstant],
    );

    await products.deleteProduct("p1");
  });

  it("still names the deleted product on the sale's line items", async () => {
    const items = await sales.getSaleItems("s1");

    expect(items).toHaveLength(1);
    expect(items[0].product_name).toBe("Amoxicillin 500mg");
  });

  it("still names the deleted product in the transaction detail view", async () => {
    const { items } = await sales.getTransactionDetails("s1");

    expect(items).toHaveLength(1);
    expect(items[0].product_name).toBe("Amoxicillin 500mg");
  });

  it("still lists the deleted product in the recent-sales item summary", async () => {
    const rows = await sales.getRecentSales();

    expect(rows).toHaveLength(1);
    expect(rows[0].item_names).toBe("Amoxicillin 500mg");
  });

  it("still names the deleted product on the daily close's sold items", async () => {
    const { itemsToday } = await sales.getDailyCloseData(SALE_DAY);

    expect(itemsToday).toHaveLength(1);
    expect(itemsToday[0].product_name).toBe("Amoxicillin 500mg");
  });

  it("still lists the deleted product in the customer's purchase history", async () => {
    const rows = await customers.getCustomerTransactions({ from: "2026-08-01", to: "2026-09-30" });

    expect(rows).toHaveLength(1);
    expect(rows[0].item_names).toBe("Amoxicillin 500mg");
  });
});
