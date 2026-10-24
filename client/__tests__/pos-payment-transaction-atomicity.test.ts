import { describe, it, expect, beforeAll, beforeEach, vi } from "vitest";
import React, { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import initSqlJs, { type Database } from "sql.js";
import type { CartItem } from "@/lib/hooks/use-pos-cart";

vi.mock("idb-keyval", () => ({
  get: vi.fn(() => Promise.resolve(undefined)),
  set: vi.fn(() => Promise.resolve(undefined)),
}));

(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

// Regression: handlePayment() used to write the sale row, then deduct stock for each cart line, then update the customer b…
// Rationale: docs/CLIENT_COMMENTS.md#block-__tests__-pos-payment-transaction-atomicity-test-ts-L13

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

describe("usePOSPayment transaction atomicity", () => {
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
  } as CartItem);

  it("rolls back the sale row when a later cart line's stock deduction throws", async () => {
    // First line succeeds, second throws - simulating an interruption
    // partway through the checkout (a lock error, quota exceeded, etc.).
    recordSaleItemStockMock
      .mockImplementationOnce(() => Promise.resolve(undefined))
      .mockImplementationOnce(() => Promise.reject(new Error("simulated failure on second line item")));

    const handle = renderPayment({
      cart: [cartItem("p1"), cartItem("p2")],
      subtotal: 2000,
      tax: 0,
      total: 2000,
      discount: 0,
      selectedCustomer: null,
      clearCart: () => {},
      refetchProducts: () => {},
    });

    act(() => handle.get().setAmountPaid("2000"));
    await act(async () => {
      await handle.get().handlePayment();
    });

    // Without the transaction wrap, this would find 1 row (the sale
    // committed before the second line item's deduction threw).
    const rows = db.exec(`SELECT COUNT(*) FROM sales`);
    expect(rows[0].values[0][0]).toBe(0);

    // recordSaleItemStock was still called for the first line before the
    // second one threw - the fix is about what got *committed*, not about
    // preventing the second call from happening.
    expect(recordSaleItemStockMock).toHaveBeenCalledTimes(2);
  });

  it("commits the sale row when every write in the sequence succeeds", async () => {
    recordSaleItemStockMock.mockImplementation(() => Promise.resolve(undefined));

    const handle = renderPayment({
      cart: [cartItem("p1"), cartItem("p2")],
      subtotal: 2000,
      tax: 0,
      total: 2000,
      discount: 0,
      selectedCustomer: null,
      clearCart: () => {},
      refetchProducts: () => {},
    });

    act(() => handle.get().setAmountPaid("2000"));
    await act(async () => {
      await handle.get().handlePayment();
    });

    const rows = db.exec(`SELECT COUNT(*) FROM sales`);
    expect(rows[0].values[0][0]).toBe(1);
  });
});
