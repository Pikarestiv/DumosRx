import { describe, it, expect, beforeAll, beforeEach, vi } from "vitest";
import initSqlJs, { type Database } from "sql.js";

vi.mock("idb-keyval", () => ({
  get: vi.fn(async () => undefined),
  set: vi.fn(async () => undefined),
}));

/**
 * Coverage gap: recordCustomerPayment (lib/db/queries/customers.ts) is the
 * single source of truth for logging a customer debt payment from both the
 * Customer Directory and a sale's transaction details, but had zero test
 * coverage (grep for "customer_payment" across __tests__/ and e2e/ turned up
 * nothing) despite touching three tables (customer_payments, customers,
 * sales) and doing money-accumulation-style FIFO allocation across a
 * customer's pending sales - the same category of arithmetic that produced
 * a real bug in three other modules (POS checkout, online-order
 * fulfillment) during this smoke-test pass.
 */
describe("recordCustomerPayment", () => {
  let db: Database;
  let core: typeof import("@/lib/db/core");
  let recordCustomerPayment: typeof import("@/lib/db/queries/customers").recordCustomerPayment;

  beforeAll(async () => {
    core = await import("@/lib/db/core");
    const customers = await import("@/lib/db/queries/customers");
    recordCustomerPayment = customers.recordCustomerPayment;

    const { SCHEMA_SQL } = await import("@/lib/db/schema");
    const SQL = await initSqlJs({
      locateFile: () => require.resolve("sql.js/dist/sql-wasm.wasm"),
    });
    db = new SQL.Database();
    db.run(SCHEMA_SQL);
    core.__setDatabaseForTesting(db);
  });

  beforeEach(() => {
    db.run(
      `DELETE FROM customer_payments; DELETE FROM sales; DELETE FROM customers;`,
    );
    core.setActiveStoreId(null);
  });

  it("records a partial payment, deducting it from the customer's outstanding balance", async () => {
    db.run(
      `INSERT INTO customers (id, first_name, outstanding_balance) VALUES ('c1', 'Jane', 1000)`,
    );

    const newBalance = await recordCustomerPayment("c1", 400, "cash", "part payment");

    expect(newBalance).toBe(600);
    const rows = db.exec(`SELECT outstanding_balance FROM customers WHERE id = 'c1'`);
    expect(rows[0].values[0][0]).toBe(600);

    const payments = db.exec(`SELECT amount, payment_method, notes FROM customer_payments WHERE customer_id = 'c1'`);
    expect(payments[0].values[0]).toEqual([400, "cash", "part payment"]);
  });

  it("clamps the resulting balance to 0 instead of going negative when the payment exceeds the outstanding balance", async () => {
    db.run(
      `INSERT INTO customers (id, first_name, outstanding_balance) VALUES ('c1', 'Jane', 300)`,
    );

    // Customer overpays (e.g. a stale/duplicate-tender scenario) by 200.
    const newBalance = await recordCustomerPayment("c1", 500, "cash");

    expect(newBalance).toBe(0);
    const rows = db.exec(`SELECT outstanding_balance FROM customers WHERE id = 'c1'`);
    expect(rows[0].values[0][0]).toBe(0);
  });

  it("applies the payment FIFO across pending sales, marking the oldest fully covered sale completed and leaving the newer one partial", async () => {
    db.run(
      `INSERT INTO customers (id, first_name, outstanding_balance) VALUES ('c1', 'Jane', 1500)`,
    );
    db.run(`INSERT INTO sales (id, transaction_number, customer_id, subtotal, total_amount, amount_paid, payment_status, created_at) VALUES
      ('s1', 'TXN-1', 'c1', 1000, 1000, 0, 'pending', '2026-01-01T00:00:00Z'),
      ('s2', 'TXN-2', 'c1', 500, 500, 0, 'pending', '2026-01-02T00:00:00Z')`);

    // Pay 1200: fully settles the older 1000 sale, leaves 200 applied to the newer 500 sale.
    await recordCustomerPayment("c1", 1200, "cash");

    const sale1 = db.exec(`SELECT amount_paid, payment_status FROM sales WHERE id = 's1'`);
    const sale2 = db.exec(`SELECT amount_paid, payment_status FROM sales WHERE id = 's2'`);
    expect(sale1[0].values[0]).toEqual([1000, "completed"]);
    expect(sale2[0].values[0]).toEqual([200, "partial"]);
  });

  it("does not error or over-allocate when the payment exceeds the total owed across all pending sales", async () => {
    db.run(
      `INSERT INTO customers (id, first_name, outstanding_balance) VALUES ('c1', 'Jane', 1000)`,
    );
    db.run(`INSERT INTO sales (id, transaction_number, customer_id, subtotal, total_amount, amount_paid, payment_status, created_at) VALUES
      ('s1', 'TXN-1', 'c1', 300, 300, 0, 'pending', '2026-01-01T00:00:00Z')`);

    // Pay far more than the single 300 sale owes.
    const newBalance = await recordCustomerPayment("c1", 900, "cash");

    expect(newBalance).toBe(100); // 1000 - 900, clamped correctly (not negative)
    const sale1 = db.exec(`SELECT amount_paid, payment_status FROM sales WHERE id = 's1'`);
    // Only the 300 actually owed gets applied to the sale - no over-allocation past its total.
    expect(sale1[0].values[0]).toEqual([300, "completed"]);
  });
});
