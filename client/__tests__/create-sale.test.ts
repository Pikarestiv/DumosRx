import { describe, it, expect, beforeAll, beforeEach, vi } from "vitest";
import initSqlJs, { type Database } from "sql.js";

vi.mock("idb-keyval", () => ({
  get: vi.fn(async () => undefined),
  set: vi.fn(async () => undefined),
}));

/**
 * Regression test for the bug where createSale()'s stock_movements insert
 * never set `performed_by` — harmless locally (that column is nullable in
 * SCHEMA_SQL), but the cloud MySQL column is a required FK with no default,
 * so every sale's movement silently failed to sync in production. Real
 * in-memory SQLite against the app's actual SCHEMA_SQL, not a mocked
 * execute() — asserting only "insert was called" would never have caught a
 * missing column the way asserting on the persisted row's actual value does.
 */
describe("createSale", () => {
  let db: Database;
  let core: typeof import("@/lib/db/core");
  let createSale: typeof import("@/lib/db/local-database").createSale;

  beforeAll(async () => {
    core = await import("@/lib/db/core");
    const localDatabase = await import("@/lib/db/local-database");
    createSale = localDatabase.createSale;

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
      `DELETE FROM sales; DELETE FROM sale_items; DELETE FROM stock_movements; DELETE FROM stock_batches; DELETE FROM products;`,
    );
    db.run(
      `INSERT INTO products (id, name, selling_price) VALUES ('prod1', 'Panadol', 450)`,
    );
    db.run(
      `INSERT INTO stock_batches (id, product_id, quantity, cost_price) VALUES ('batch1', 'prod1', 100, 270)`,
    );
    localStorage.setItem(
      "dumos_user",
      JSON.stringify({ id: "user1", first_name: "Test", last_name: "User" }),
    );
  });

  it("stamps performed_by on the resulting stock_movements row from the logged-in user", async () => {
    await createSale(
      {
        transaction_number: "TXN-1",
        subtotal: 450,
        total_amount: 450,
        amount_paid: 450,
        payment_method: "cash",
        payment_status: "completed",
      },
      [
        {
          product_id: "prod1",
          stock_batch_id: "batch1",
          quantity: 1,
          cost_price: 270,
          unit_price: 450,
          total_price: 450,
        },
      ],
    );

    const movements = db.exec(
      "SELECT performed_by FROM stock_movements WHERE reference_type = 'sale'",
    );
    expect(movements[0]?.values[0]?.[0]).toBe("user1");
  });

  it("falls back to null (not a crash) when no user is logged in locally", async () => {
    localStorage.removeItem("dumos_user");

    await createSale(
      {
        transaction_number: "TXN-2",
        subtotal: 450,
        total_amount: 450,
        amount_paid: 450,
        payment_method: "cash",
        payment_status: "completed",
      },
      [
        {
          product_id: "prod1",
          stock_batch_id: "batch1",
          quantity: 1,
          cost_price: 270,
          unit_price: 450,
          total_price: 450,
        },
      ],
    );

    const movements = db.exec(
      "SELECT performed_by FROM stock_movements WHERE reference_type = 'sale'",
    );
    expect(movements[0]?.values[0]?.[0]).toBeNull();
  });
});
