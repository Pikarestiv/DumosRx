import { describe, it, expect, beforeAll, beforeEach, vi } from "vitest";
import React, { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import initSqlJs, { type Database } from "sql.js";

vi.mock("idb-keyval", () => ({
  get: vi.fn(async () => undefined),
  set: vi.fn(async () => undefined),
}));

// React 19's `act` warns unless the environment explicitly opts in.
(globalThis as any).IS_REACT_ACT_ENVIRONMENT = true;

/**
 * Regression coverage for usePOSPayment.handlePayment() having no
 * re-entrancy guard: the only protection against a second invocation was
 * the submit button's `disabled={processingPayment}` prop, which only
 * takes effect a render tick after the click that caused it. On the
 * touchscreen POS tablets this app targets, a close-enough double-tap can
 * dispatch two handlePayment() calls before that render lands - each
 * generating its own unique transactionNumber, so the UNIQUE constraint
 * doesn't catch it as a duplicate - producing two sales rows for one
 * physical transaction. See docs/FIXED_BUGS.md.
 *
 * Harness mirrors use-pos-payment-loyalty-gate.test.ts's pattern (no
 * @testing-library/react installed in this repo).
 */
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
  } as any;

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
