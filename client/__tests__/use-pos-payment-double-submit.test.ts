import { describe, it, expect, beforeAll, beforeEach, vi } from "vitest";
import React, { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import initSqlJs, { type Database } from "sql.js";
import type { CartItem } from "@/lib/hooks/use-pos-cart";

vi.mock("idb-keyval", () => ({
  get: vi.fn(() => Promise.resolve(undefined)),
  set: vi.fn(() => Promise.resolve(undefined)),
}));

// React 19's `act` warns unless the environment explicitly opts in.
(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

// Regression coverage for usePOSPayment.handlePayment() having no re-entrancy guard:
// Rationale: docs/CLIENT_COMMENTS.md#block-__tests__-use-pos-payment-double-submit-test-ts-L14
describe("usePOSPayment double-submit guard", () => {
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
    db.run(`DELETE FROM sale_items; DELETE FROM sales;`);
    core.setActiveStoreId(null);
    window.localStorage.setItem("dumos_user", JSON.stringify({ id: "user-1" }));

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
    return {
      get: () => hookResult,
    };
  }

  const cartItem = {
    id: "p1",
    name: "Panadol",
    unit_price: 100,
    cost_price: 50,
    quantity: 1,
    subtotal: 100,
  } as unknown as CartItem;

  it("only creates one sale when handlePayment is invoked twice before the first completes", async () => {
    const handle = renderPayment({
      cart: [cartItem],
      subtotal: 100,
      tax: 0,
      total: 100,
      discount: 0,
      selectedCustomer: null,
      clearCart: () => {},
      refetchProducts: () => {},
    });

    act(() => {
      handle.get().setAmountPaid("100");
    });

    // No `await` between the two calls - simulates two click events
    // dispatched before React re-renders with processingPayment: true.
    await act(async () => {
      await Promise.all([handle.get().handlePayment(), handle.get().handlePayment()]);
    });

    const rows = db.exec(`SELECT id FROM sales`);
    const saleCount = rows.length === 0 ? 0 : rows[0].values.length;
    expect(saleCount).toBe(1);
  });
});
