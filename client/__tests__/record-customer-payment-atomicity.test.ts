import { describe, it, expect, beforeAll, beforeEach, vi } from "vitest";

vi.mock("idb-keyval", () => ({
  get: vi.fn(async () => undefined),
  set: vi.fn(async () => undefined),
}));

/**
 * Regression: recordCustomerPayment() wrote the customer_payments receipt,
 * reduced customers.outstanding_balance, and settled individual sales via
 * applyCreditPaymentFIFO() as three independent, individually-committed
 * steps - no transaction(). A throw partway through (e.g. inside the FIFO
 * loop's per-sale update) left a real payment receipt and an already-reduced
 * balance behind while the underlying sales stayed pending/partial: the
 * debtor ledger and the per-sale settlement permanently disagree, and the
 * next payment would re-settle sales that were already paid for.
 */
describe("recordCustomerPayment transaction atomicity", () => {
  let db: import("sql.js").Database;
  let core: typeof import("@/lib/db/core");
  let recordCustomerPayment: typeof import("@/lib/db/queries/customers").recordCustomerPayment;
  let updateSpy: ReturnType<typeof vi.fn>;

  beforeAll(async () => {
    vi.doMock("@/lib/db/local-database", async () => {
      const actual = await vi.importActual<typeof import("@/lib/db/local-database")>(
        "@/lib/db/local-database",
      );
      updateSpy = vi.fn(
        async (table: string, id: string, data: Record<string, unknown>, options?: unknown) => {
          if (table === "sales") {
            throw new Error("simulated failure settling a sale via FIFO");
          }
          return actual.update(table, id, data, options as never);
        },
      );
      return { ...actual, update: updateSpy };
    });

    core = await import("@/lib/db/core");
    recordCustomerPayment = (await import("@/lib/db/queries/customers")).recordCustomerPayment;

    const initSqlJs = (await import("sql.js")).default;
    const { SCHEMA_SQL } = await import("@/lib/db/schema");
    const SQL = await initSqlJs({
      locateFile: () => require.resolve("sql.js/dist/sql-wasm.wasm"),
    });
    db = new SQL.Database();
    db.run(SCHEMA_SQL);
    core.__setDatabaseForTesting(db);
  });

  beforeEach(() => {
    db.run(`DELETE FROM customer_payments; DELETE FROM customers; DELETE FROM sales;`);
    core.setActiveStoreId(null);
    updateSpy?.mockClear();

    db.run(
      `INSERT INTO customers (id, first_name, outstanding_balance) VALUES ('c1', 'Jane', 10000)`,
    );
    db.run(
      `INSERT INTO sales (id, transaction_number, customer_id, subtotal, total_amount, amount_paid, payment_status, _deleted) VALUES
        ('s1', 'TXN1', 'c1', 10000, 10000, 0, 'pending', 0)`,
    );
  });

  it("rolls back the payment receipt and balance reduction when settling the underlying sale fails", async () => {
    await expect(
      recordCustomerPayment("c1", 5000, "cash"),
    ).rejects.toThrow("simulated failure settling a sale via FIFO");

    const payments = db.exec(`SELECT COUNT(*) FROM customer_payments WHERE customer_id = 'c1'`);
    expect(payments[0].values[0][0]).toBe(0);

    const customer = db.exec(`SELECT outstanding_balance FROM customers WHERE id = 'c1'`);
    expect(customer[0].values[0][0]).toBe(10000);
  });
});
