import { describe, it, expect, beforeAll, beforeEach, vi } from "vitest";
import React, { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import initSqlJs, { type Database } from "sql.js";

vi.mock("idb-keyval", () => ({
  get: vi.fn(async () => undefined),
  set: vi.fn(async () => undefined),
}));

(globalThis as any).IS_REACT_ACT_ENVIRONMENT = true;

/**
 * Regression: handlePayment() wrote outstanding_balance/loyalty_points as
 * `(selectedCustomer.outstanding_balance || 0) + delta` — a read-modify-write
 * against the in-memory Customer object captured when the cashier picked the
 * customer, not the DB row at write time. Every sibling write path
 * (recordCustomerPayment, computeEarnedPoints) deliberately re-reads current
 * state first for exactly this reason; checkout was the one outlier. If the
 * customer's real balance/points changed after selection (another terminal's
 * sale/payment landed via sync, or just time passing in a long POS session)
 * before this checkout completed, that change was silently clobbered — no
 * error, no conflict signal, since only the JS object was stale, not the
 * DB row's _version.
 *
 * Fix: both writes now re-read the current value from the DB immediately
 * before computing the new one, exactly like recordCustomerPayment.
 */

const recordSaleItemStockMock = vi.fn();

vi.mock("@/lib/db/queries/inventory", async () => {
  const actual = await vi.importActual<typeof import("@/lib/db/queries/inventory")>(
    "@/lib/db/queries/inventory",
  );
  return {
    ...actual,
    recordSaleItemStock: (...args: unknown[]) => recordSaleItemStockMock(...args),
  };
});

describe("usePOSPayment does not clobber a stale customer balance/loyalty snapshot", () => {
  let db: Database;
  let core: typeof import("@/lib/db/core");
  let usePOSPayment: typeof import("@/lib/hooks/use-pos-payment").usePOSPayment;
  let container: HTMLDivElement;
  let root: Root;

  beforeAll(async () => {
    core = await import("@/lib/db/core");
    usePOSPayment = (await import("@/lib/hooks/use-pos-payment")).usePOSPayment;

    const { SCHEMA_SQL } = await import("@/lib/db/schema");
    const SQL = await initSqlJs({
      locateFile: () => require.resolve("sql.js/dist/sql-wasm.wasm"),
    });
    db = new SQL.Database();
    db.run(SCHEMA_SQL);
    core.__setDatabaseForTesting(db);
  });

  beforeEach(() => {
    db.run(`DELETE FROM sale_items; DELETE FROM sales; DELETE FROM customers;`);
    core.setActiveStoreId(null);
    window.localStorage.setItem("dumos_user", JSON.stringify({ id: "user-1" }));
    recordSaleItemStockMock.mockReset();
    recordSaleItemStockMock.mockImplementation(async () => undefined);

    container = document.createElement("div");
    document.body.appendChild(container);
    root = createRoot(container);
  });

  type PaymentProps = Parameters<typeof usePOSPayment>[0];

  function renderPayment(props: PaymentProps) {
    let hookResult!: ReturnType<typeof usePOSPayment>;
    function TestHost() {
      hookResult = usePOSPayment(props);
      return null;
    }
    act(() => {
      root.render(React.createElement(TestHost));
    });
    return { get: () => hookResult };
  }

  const cartItem = (id: string) => ({
    id,
    name: `Product ${id}`,
    unit_price: 1000,
    cost_price: 500,
    quantity: 1,
    subtotal: 1000,
  } as any);

  it("adds a credit sale on top of the DB's current balance, not the stale in-memory snapshot", async () => {
    db.run(
      `INSERT INTO customers (id, first_name, outstanding_balance) VALUES ('cust-1', 'Ade', 5000)`,
    );

    // selectedCustomer was captured when the cashier picked the customer,
    // before another terminal's sale pushed the real balance to 5000.
    const staleCustomer = {
      id: "cust-1",
      first_name: "Ade",
      last_name: "",
      phone: "",
      loyalty_points: 0,
      outstanding_balance: 0,
    };

    const handle = renderPayment({
      cart: [cartItem("p1")],
      subtotal: 3000,
      tax: 0,
      total: 3000,
      discount: 0,
      selectedCustomer: staleCustomer,
      clearCart: () => {},
      refetchProducts: () => {},
    });

    await act(async () => {
      handle.get().setPaymentMethod("credit" as any);
    });
    await act(async () => {
      await handle.get().handlePayment();
    });

    const rows = db.exec(
      `SELECT outstanding_balance FROM customers WHERE id = 'cust-1'`,
    );
    // Correct: 5000 (real DB balance) + 3000 (this sale) = 8000.
    // The bug would have written 0 (stale snapshot) + 3000 = 3000, silently
    // erasing the other terminal's 5000 debt.
    expect(rows[0].values[0][0]).toBe(8000);
  });

  it("adds a mixed-payment credit split on top of the DB's current balance", async () => {
    db.run(
      `INSERT INTO customers (id, first_name, outstanding_balance) VALUES ('cust-2', 'Bola', 2000)`,
    );

    const staleCustomer = {
      id: "cust-2",
      first_name: "Bola",
      last_name: "",
      phone: "",
      loyalty_points: 0,
      outstanding_balance: 0,
    };

    const handle = renderPayment({
      cart: [cartItem("p1")],
      subtotal: 3000,
      tax: 0,
      total: 3000,
      discount: 0,
      selectedCustomer: staleCustomer,
      clearCart: () => {},
      refetchProducts: () => {},
    });

    await act(async () => {
      handle.get().setPaymentMethod("mixed" as any);
      handle.get().setPaymentSplits([
        { method: "cash", amount: 2000 },
        { method: "credit", amount: 1000 },
      ] as any);
    });
    await act(async () => {
      await handle.get().handlePayment();
    });

    const rows = db.exec(
      `SELECT outstanding_balance FROM customers WHERE id = 'cust-2'`,
    );
    // Correct: 2000 (real DB balance) + 1000 (credit split) = 3000.
    expect(rows[0].values[0][0]).toBe(3000);
  });
});
