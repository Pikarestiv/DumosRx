import { describe, it, expect, beforeAll, beforeEach, vi } from "vitest";
import initSqlJs, { type Database } from "sql.js";

vi.mock("idb-keyval", () => ({
  get: vi.fn(() => Promise.resolve(undefined)),
  set: vi.fn(() => Promise.resolve(undefined)),
}));

describe("customer purchase history counts and names service lines", () => {
  let db: Database;
  let customers: typeof import("@/lib/db/queries/customers");
  const saleInstant = new Date(2026, 8, 1, 10, 0, 0, 0).toISOString();

  beforeAll(async () => {
    const core = await import("@/lib/db/core");
    customers = await import("@/lib/db/queries/customers");
    const { SCHEMA_SQL } = await import("@/lib/db/schema");
    const SQL = await initSqlJs({ locateFile: () => require.resolve("sql.js/dist/sql-wasm.wasm") });
    db = new SQL.Database();
    db.run(SCHEMA_SQL);
    const { runSchemaMigrations, makeSqlJsAdapter } = await import("@/lib/db/schema-migrations");
    await runSchemaMigrations(makeSqlJsAdapter(db));
    core.__setDatabaseForTesting(db);
    core.setActiveStoreId(null);
  });

  beforeEach(() => {
    db.run(`DELETE FROM products; DELETE FROM customers; DELETE FROM sales; DELETE FROM sale_items; DELETE FROM sale_services;`);
    db.run(`INSERT INTO products (id, name, selling_price, is_active, _deleted) VALUES ('p1', 'Body Lotion', 3000, 1, 0)`);
    db.run(`INSERT INTO customers (id, first_name, last_name, _deleted) VALUES ('cust1', 'Ada', 'Obi', 0)`);
  });

  function seedSale(id: string) {
    db.run(
      `INSERT INTO sales (id, transaction_number, customer_id, subtotal, total_amount, transaction_date, created_at, _deleted)
       VALUES (?, ?, 'cust1', 0, 0, ?, ?, 0)`,
      [id, `TXN-${id}`, saleInstant, saleInstant],
    );
  }

  function seedService(id: string, saleId: string, name: string, deleted = 0) {
    db.run(
      `INSERT INTO sale_services (id, sale_id, service_name, quantity, unit_price, total_price, _deleted) VALUES (?, ?, ?, 1, 1000, 1000, ?)`,
      [id, saleId, name, deleted],
    );
  }

  async function historyRow(saleId: string) {
    const rows = await customers.getCustomerTransactions({ from: "2026-08-01", to: "2026-09-30" });
    return rows.find((r) => r.id === saleId);
  }

  it("lists a services-only sale with its service count and names", async () => {
    seedSale("s1");
    seedService("ss1", "s1", "Consultation");
    seedService("ss2", "s1", "Dressing");
    seedService("ss3", "s1", "Voided Scan", 1);

    const row = await historyRow("s1");

    expect(row?.item_count).toBe(2);
    expect(String(row?.item_names).split("||").sort()).toEqual(["Consultation", "Dressing"]);
  });

  it("counts product and service lines together on a mixed sale", async () => {
    seedSale("s2");
    db.run(
      `INSERT INTO sale_items (id, sale_id, product_id, quantity, unit_price, cost_price, total_price, _deleted) VALUES ('si1', 's2', 'p1', 2, 3000, 2000, 6000, 0)`,
    );
    seedService("ss4", "s2", "Massage");

    const row = await historyRow("s2");

    expect(row?.item_count).toBe(2);
    expect(String(row?.item_names).split("||").sort()).toEqual(["Body Lotion", "Massage"]);
  });

  it("leaves a sale with no lines at zero items and no names", async () => {
    seedSale("s3");

    const row = await historyRow("s3");

    expect(row?.item_count).toBe(0);
    expect(row?.item_names ?? null).toBeNull();
  });
});
