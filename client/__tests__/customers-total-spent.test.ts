import { describe, it, expect, beforeAll, beforeEach, vi } from "vitest";
import initSqlJs, { type Database } from "sql.js";

vi.mock("idb-keyval", () => ({
  get: vi.fn(async () => undefined),
  set: vi.fn(async () => undefined),
}));

/**
 * Regression coverage for KNOWN_BUGS.md #7: getCustomers()'s total_spent
 * summed sales.total_amount only, never subtracting returns.total_refunded
 * — sales.total_amount is deliberately never mutated on return (net figures
 * are meant to be derived as total_amount - total_refunded elsewhere in the
 * app), so a customer's displayed total spent overstated by the sum of
 * their refunds.
 */
describe("getCustomers total_spent", () => {
  let db: Database;
  let core: typeof import("@/lib/db/core");
  let getCustomers: typeof import("@/lib/db/queries/customers").getCustomers;

  beforeAll(async () => {
    core = await import("@/lib/db/core");
    const customers = await import("@/lib/db/queries/customers");
    getCustomers = customers.getCustomers;

    const SQL = await initSqlJs({
      locateFile: () => require.resolve("sql.js/dist/sql-wasm.wasm"),
    });
    db = new SQL.Database();
    db.run(`
      CREATE TABLE customers (
        id TEXT PRIMARY KEY, first_name TEXT, last_name TEXT, _deleted INTEGER DEFAULT 0
      );
      CREATE TABLE sales (
        id TEXT PRIMARY KEY, customer_id TEXT, total_amount REAL, transaction_date TEXT,
        _deleted INTEGER DEFAULT 0
      );
      CREATE TABLE returns (
        id TEXT PRIMARY KEY, sale_id TEXT, total_refunded REAL, _deleted INTEGER DEFAULT 0
      );
    `);
    core.__setDatabaseForTesting(db);
  });

  beforeEach(() => {
    db.run(`DELETE FROM customers; DELETE FROM sales; DELETE FROM returns;`);
  });

  it("subtracts refunds from total_spent instead of counting the gross sale amount", async () => {
    db.run(`INSERT INTO customers (id, first_name, last_name) VALUES ('c1', 'Jane', 'Doe')`);
    db.run(
      `INSERT INTO sales (id, customer_id, total_amount, transaction_date) VALUES ('s1', 'c1', 1000, '2026-01-01')`,
    );
    db.run(`INSERT INTO returns (id, sale_id, total_refunded) VALUES ('r1', 's1', 300)`);

    const customers = await getCustomers();

    // Net spend: 1000 - 300 = 700, not the gross 1000.
    expect(customers[0].total_spent).toBe(700);
  });

  it("sums total_amount unchanged when there are no returns", async () => {
    db.run(`INSERT INTO customers (id, first_name, last_name) VALUES ('c1', 'Jane', 'Doe')`);
    db.run(
      `INSERT INTO sales (id, customer_id, total_amount, transaction_date) VALUES ('s1', 'c1', 1000, '2026-01-01')`,
    );

    const customers = await getCustomers();

    expect(customers[0].total_spent).toBe(1000);
  });

  it("nets refunds per sale across multiple sales for the same customer", async () => {
    db.run(`INSERT INTO customers (id, first_name, last_name) VALUES ('c1', 'Jane', 'Doe')`);
    db.run(`INSERT INTO sales (id, customer_id, total_amount, transaction_date) VALUES
      ('s1', 'c1', 1000, '2026-01-01'),
      ('s2', 'c1', 500, '2026-01-02')`);
    db.run(`INSERT INTO returns (id, sale_id, total_refunded) VALUES ('r1', 's1', 300)`);

    const customers = await getCustomers();

    // (1000 - 300) + 500 = 1200
    expect(customers[0].total_spent).toBe(1200);
  });

  it("excludes soft-deleted returns from the refund deduction", async () => {
    db.run(`INSERT INTO customers (id, first_name, last_name) VALUES ('c1', 'Jane', 'Doe')`);
    db.run(
      `INSERT INTO sales (id, customer_id, total_amount, transaction_date) VALUES ('s1', 'c1', 1000, '2026-01-01')`,
    );
    db.run(`INSERT INTO returns (id, sale_id, total_refunded, _deleted) VALUES ('r1', 's1', 300, 1)`);

    const customers = await getCustomers();

    expect(customers[0].total_spent).toBe(1000);
  });
});

describe("getCustomerRetentionMetrics avgTransactionValue", () => {
  let core: typeof import("@/lib/db/core");
  let getCustomerRetentionMetrics: typeof import("@/lib/db/queries/customers").getCustomerRetentionMetrics;
  let db: Database;

  beforeAll(async () => {
    core = await import("@/lib/db/core");
    const customers = await import("@/lib/db/queries/customers");
    getCustomerRetentionMetrics = customers.getCustomerRetentionMetrics;

    const SQL = await initSqlJs({
      locateFile: () => require.resolve("sql.js/dist/sql-wasm.wasm"),
    });
    db = new SQL.Database();
    db.run(`
      CREATE TABLE sales (
        id TEXT PRIMARY KEY, customer_id TEXT, total_amount REAL, transaction_date TEXT,
        _deleted INTEGER DEFAULT 0
      );
      CREATE TABLE returns (
        id TEXT PRIMARY KEY, sale_id TEXT, total_refunded REAL, _deleted INTEGER DEFAULT 0
      );
    `);
    core.__setDatabaseForTesting(db);
  });

  beforeEach(() => {
    db.run(`DELETE FROM sales; DELETE FROM returns;`);
  });

  it("nets refunds out of the revenue used to compute avg transaction value", async () => {
    const now = new Date().toISOString();
    db.run(
      `INSERT INTO sales (id, customer_id, total_amount, transaction_date) VALUES ('s1', 'c1', 1000, ?)`,
      [now],
    );
    db.run(`INSERT INTO returns (id, sale_id, total_refunded) VALUES ('r1', 's1', 300)`);

    const { avgTransactionValue } = await getCustomerRetentionMetrics();

    // One visit, net revenue 700 -> avg transaction value 700, not 1000.
    expect(avgTransactionValue).toBe(700);
  });
});
