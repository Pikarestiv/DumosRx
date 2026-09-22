import { describe, it, expect, beforeAll, beforeEach, vi } from "vitest";
import { renderHook, act } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import initSqlJs, { type Database } from "sql.js";
import type { ReactNode } from "react";
import React from "react";
import type { OnlineOrder } from "@/lib/types/online-order";

vi.mock("idb-keyval", () => ({
  get: vi.fn(async () => undefined),
  set: vi.fn(async () => undefined),
}));

vi.mock("@/lib/api/client", () => ({
  apiClient: {
    fulfillOnlineOrder: vi.fn(async () => undefined),
  },
}));

/**
 * Runs against a real in-memory SQLite engine (sql.js), not a mocked
 * insert() - a mocked insert only checks the shape of the object handed to
 * it and would happily "pass" while writing to columns that don't exist, or
 * omitting a NOT NULL one (both of which this hook has actually done; see
 * FIXED_BUGS.md). Only the network call (apiClient.fulfillOnlineOrder) is
 * mocked.
 */
describe("useFulfillOnlineOrderMutation", () => {
  let db: Database;
  let core: typeof import("@/lib/db/core");

  beforeAll(async () => {
    core = await import("@/lib/db/core");
    const { SCHEMA_SQL } = await import("@/lib/db/schema");
    const SQL = await initSqlJs({
      locateFile: () => require.resolve("sql.js/dist/sql-wasm.wasm"),
    });
    db = new SQL.Database();
    db.run(SCHEMA_SQL);
    // store_id/cashier_id etc. are added via the sync-column migrations,
    // not the base SCHEMA_SQL - the hook under test writes both.
    const { runSchemaMigrations, makeSqlJsAdapter } = await import("@/lib/db/schema-migrations");
    await runSchemaMigrations(makeSqlJsAdapter(db));
    core.__setDatabaseForTesting(db);
  });

  beforeEach(() => {
    db.run(`DELETE FROM sales; DELETE FROM sale_items; DELETE FROM stock_batches; DELETE FROM stock_movements; DELETE FROM sale_item_batches; DELETE FROM products;`);
    vi.clearAllMocks();
  });

  function wrapper({ children }: { children: ReactNode }) {
    const queryClient = new QueryClient();
    return React.createElement(QueryClientProvider, { client: queryClient }, children);
  }

  function seedProductWithBatch(productId: string, costPrice: number, quantity: number) {
    db.run(`INSERT INTO products (id, name, selling_price) VALUES (?, 'Test Product', 1000)`, [productId]);
    db.run(
      `INSERT INTO stock_batches (id, product_id, quantity, cost_price, is_active, _deleted) VALUES (?, ?, ?, ?, 1, 0)`,
      [`batch-${productId}`, productId, quantity, costPrice],
    );
  }

  const order: OnlineOrder = {
    id: "order-1",
    customer_name: "Jane Doe",
    total_amount: 5000,
    payment_method: "cash",
    order_status: "pending",
    created_at: new Date().toISOString(),
    items: [{ id: "oi1", product_id: "p1", quantity: 2, unit_price: 2500, subtotal: 5000 }],
  };

  it("inserts a valid sales row (real schema, no NOT NULL/unknown-column errors) with the customer name in notes", async () => {
    seedProductWithBatch("p1", 500, 10);
    const { useFulfillOnlineOrderMutation } = await import(
      "@/lib/hooks/use-fulfill-online-order-mutation"
    );
    const { result } = renderHook(() => useFulfillOnlineOrderMutation(), { wrapper });

    await act(async () => {
      await result.current.mutateAsync({ order, storeId: "store1", cashierId: "cashier1" });
    });

    expect(result.current.isError).toBe(false);

    const rows = db.exec(`SELECT transaction_number, subtotal, total_amount, payment_status, notes FROM sales`);
    expect(rows[0]?.values.length).toBe(1);
    const [transactionNumber, subtotal, totalAmount, paymentStatus, notes] = rows[0].values[0];
    expect(typeof transactionNumber).toBe("string");
    expect((transactionNumber as string).length).toBeGreaterThan(0);
    expect(subtotal).toBe(5000);
    expect(totalAmount).toBe(5000);
    expect(paymentStatus).toBe("paid");
    expect(notes).toBe("Online order - Jane Doe");
  });

  it("records the sale_items row and deducts stock for the fulfilled order", async () => {
    seedProductWithBatch("p1", 500, 10);
    const { useFulfillOnlineOrderMutation } = await import(
      "@/lib/hooks/use-fulfill-online-order-mutation"
    );
    const { result } = renderHook(() => useFulfillOnlineOrderMutation(), { wrapper });

    await act(async () => {
      await result.current.mutateAsync({ order, storeId: "store1", cashierId: "cashier1" });
    });

    const itemRows = db.exec(`SELECT product_id, quantity, cost_price FROM sale_items`);
    expect(itemRows[0]?.values).toEqual([["p1", 2, 500]]);

    const batchRows = db.exec(`SELECT quantity FROM stock_batches WHERE product_id = 'p1'`);
    expect(batchRows[0]?.values[0][0]).toBe(8); // 10 - 2
  });

  it("generates a distinct transaction_number per fulfillment (not derived from a shared order-id prefix)", async () => {
    seedProductWithBatch("p1", 500, 10);
    const { useFulfillOnlineOrderMutation } = await import(
      "@/lib/hooks/use-fulfill-online-order-mutation"
    );
    const { result: r1 } = renderHook(() => useFulfillOnlineOrderMutation(), { wrapper });

    await act(async () => {
      await r1.current.mutateAsync({ order, storeId: "store1", cashierId: "cashier1" });
    });
    await act(async () => {
      await r1.current.mutateAsync({ order: { ...order, id: "order-2" }, storeId: "store1", cashierId: "cashier1" });
    });

    const rows = db.exec(`SELECT transaction_number FROM sales ORDER BY created_at`);
    const numbers = rows[0].values.map((v) => v[0]);
    expect(new Set(numbers).size).toBe(2);
  });
});
