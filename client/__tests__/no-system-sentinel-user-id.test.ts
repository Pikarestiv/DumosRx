import { describe, it, expect, beforeAll, beforeEach, vi } from "vitest";
import { renderHook, act } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import initSqlJs, { type Database } from "sql.js";
import type { ReactNode } from "react";
import React from "react";

vi.mock("idb-keyval", () => ({
  get: vi.fn(async () => undefined),
  set: vi.fn(async () => undefined),
}));

vi.mock("sonner", () => ({
  toast: { success: vi.fn(), error: vi.fn(), warning: vi.fn(), info: vi.fn() },
}));

/**
 * A-21. `returns.user_id` and `stock_audits.user_id` both fell back to the
 * literal string "system" when the caller passed no user. Both columns are
 * `foreignUuid('user_id')->constrained('users')` server-side, so the row
 * writes locally, pushes, fails the FK, retries through backoff, and is
 * finally reported to superadmins as a permanently stuck sync item after 5
 * attempts — the same failure shape already fixed once for `feedback`.
 *
 * Every real call site sources the id from `useAuth().user?.id` on a
 * route-guarded screen (the return dialog, the cycle-count screen, the
 * catalog quick edit, the CSV import dialog), so a missing id is a caller
 * bug, not a legitimate state. Fail loudly and locally at the call, before
 * anything is written, instead of writing a row that can only fail later,
 * elsewhere, and silently.
 */
describe("returns/stock_audits refuse a missing user id instead of writing a sentinel", () => {
  let db: Database;
  let core: typeof import("@/lib/db/core");
  let useProcessReturnMutation: typeof import("@/lib/hooks/use-process-return-mutation").useProcessReturnMutation;
  let submitStockAudit: typeof import("@/lib/db/queries/inventory").submitStockAudit;

  beforeAll(async () => {
    core = await import("@/lib/db/core");
    ({ useProcessReturnMutation } = await import(
      "@/lib/hooks/use-process-return-mutation"
    ));
    ({ submitStockAudit } = await import("@/lib/db/queries/inventory"));

    const { SCHEMA_SQL } = await import("@/lib/db/schema");
    const SQL = await initSqlJs({
      locateFile: () => require.resolve("sql.js/dist/sql-wasm.wasm"),
    });
    db = new SQL.Database();
    db.run(SCHEMA_SQL);
    const { runSchemaMigrations, makeSqlJsAdapter } = await import(
      "@/lib/db/schema-migrations"
    );
    await runSchemaMigrations(makeSqlJsAdapter(db));
    core.__setDatabaseForTesting(db);
  });

  beforeEach(() => {
    db.run(`
      DELETE FROM sales; DELETE FROM sale_items; DELETE FROM sale_item_batches;
      DELETE FROM returns; DELETE FROM return_items; DELETE FROM customers;
      DELETE FROM stock_audits; DELETE FROM stock_batches;
      DELETE FROM stock_movements; DELETE FROM products;
      DELETE FROM _sync_queue; DELETE FROM audit_logs;
    `);
    core.setActiveStoreId(null);
    localStorage.setItem("dumos_user", JSON.stringify({ id: "user-1" }));
  });

  function wrapper({ children }: { children: ReactNode }) {
    const queryClient = new QueryClient({
      defaultOptions: { mutations: { retry: false } },
    });
    return React.createElement(QueryClientProvider, { client: queryClient }, children);
  }

  function seedSale() {
    db.run(`INSERT INTO products (id, name, selling_price) VALUES ('p1', 'Panadol', 25)`);
    db.run(
      `INSERT INTO stock_batches (id, product_id, batch_number, quantity, cost_price)
       VALUES ('b1', 'p1', 'B-1', 0, 5)`,
    );
    db.run(
      `INSERT INTO sales (id, transaction_number, subtotal, total_amount, amount_paid,
        payment_method, payment_status) VALUES ('s1', 'TXN-s1', 100, 100, 100, 'cash', 'completed')`,
    );
    db.run(
      `INSERT INTO sale_items (id, sale_id, product_id, quantity, unit_price, cost_price, total_price)
       VALUES ('si1', 's1', 'p1', 4, 25, 5, 100)`,
    );
    db.run(
      `INSERT INTO sale_item_batches (id, sale_item_id, stock_batch_id, quantity)
       VALUES ('sib1', 'si1', 'b1', 4)`,
    );
    const saleItem = {
      id: "si1",
      sale_id: "s1",
      product_id: "p1",
      product_name: "Panadol",
      quantity: 4,
      unit_price: 25,
      cost_price: 5,
      total_price: 100,
      returned_quantity: 0,
    };
    const sale = {
      id: "s1",
      transaction_number: "TXN-s1",
      subtotal: 100,
      total_amount: 100,
      amount_paid: 100,
      payment_method: "cash",
      points_earned: 0,
      points_redeemed: 0,
    };
    return { sale, saleItem };
  }

  async function processReturn(params: Record<string, unknown>) {
    const { result } = renderHook(() => useProcessReturnMutation(), { wrapper });
    let error: unknown;
    await act(async () => {
      await result.current.mutateAsync(params as never).catch((err) => {
        error = err;
      });
    });
    return error;
  }

  function count(table: string): number {
    return db.exec(`SELECT COUNT(*) FROM ${table}`)[0].values[0][0] as number;
  }

  it("rejects a return with no user id rather than writing user_id = 'system'", async () => {
    const { sale, saleItem } = seedSale();

    const error = await processReturn({
      sale,
      userId: undefined,
      reason: "Damaged",
      totalRefund: 100,
      itemsToReturn: [{ ...saleItem, returnQuantity: 4 }],
      saleItems: [saleItem],
    });

    expect(error).toBeInstanceOf(Error);
    expect(count("returns")).toBe(0);
    expect(count("return_items")).toBe(0);
    // The sale itself must be untouched too — a rejected return is not a
    // partial one.
    expect(db.exec(`SELECT payment_status FROM sales WHERE id = 's1'`)[0].values[0][0]).toBe(
      "completed",
    );
  });

  it("still processes a return that carries a real user id", async () => {
    const { sale, saleItem } = seedSale();

    const error = await processReturn({
      sale,
      userId: "user-1",
      reason: "Damaged",
      totalRefund: 100,
      itemsToReturn: [{ ...saleItem, returnQuantity: 4 }],
      saleItems: [saleItem],
    });

    expect(error).toBeUndefined();
    expect(db.exec(`SELECT user_id FROM returns`)[0].values[0][0]).toBe("user-1");
  });

  it("rejects a stock audit with no performer rather than writing user_id = 'system'", async () => {
    db.run(`INSERT INTO products (id, name, selling_price) VALUES ('p1', 'Panadol', 25)`);
    db.run(
      `INSERT INTO stock_batches (id, product_id, batch_number, quantity, cost_price, is_active, _deleted)
       VALUES ('b1', 'p1', 'B-1', 10, 5, 1, 0)`,
    );

    await expect(
      submitStockAudit(
        [{ productId: "p1", systemQty: 10, countedQty: 7, reason: "Cycle count" }],
        null,
      ),
    ).rejects.toThrow();

    expect(count("stock_audits")).toBe(0);
    // Nothing of the adjustment may survive either.
    expect(count("stock_movements")).toBe(0);
    expect(db.exec(`SELECT quantity FROM stock_batches WHERE id = 'b1'`)[0].values[0][0]).toBe(10);
  });

  it("still records a stock audit that carries a real performer", async () => {
    db.run(`INSERT INTO products (id, name, selling_price) VALUES ('p1', 'Panadol', 25)`);
    db.run(
      `INSERT INTO stock_batches (id, product_id, batch_number, quantity, cost_price, is_active, _deleted)
       VALUES ('b1', 'p1', 'B-1', 10, 5, 1, 0)`,
    );

    await submitStockAudit(
      [{ productId: "p1", systemQty: 10, countedQty: 7, reason: "Cycle count" }],
      "user-1",
    );

    expect(db.exec(`SELECT user_id FROM stock_audits`)[0].values[0][0]).toBe("user-1");
  });

  it("never writes the literal 'system' into either user_id column", () => {
    const returns = db.exec(`SELECT COUNT(*) FROM returns WHERE user_id = 'system'`);
    const audits = db.exec(`SELECT COUNT(*) FROM stock_audits WHERE user_id = 'system'`);
    expect(returns[0].values[0][0]).toBe(0);
    expect(audits[0].values[0][0]).toBe(0);
  });
});
