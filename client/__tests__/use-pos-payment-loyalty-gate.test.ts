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
 * Defense-in-depth coverage for the Gap 1 backend fix: usePOSPayment must
 * never write loyalty_transactions (earn OR redeem) when canUseLoyaltyProgram
 * is false, even with a customer selected and a redemption staged. This is
 * the real security/business-logic boundary — the POSRedeemReward UI being
 * hidden is not sufficient on its own, since cart state (redeemedOption) can
 * survive a plan downgrade or a stale tab.
 *
 * usePOSPayment is a React hook (useState/useEffect), so it can't be called
 * directly outside a component. No @testing-library/react is installed in
 * this repo, so this uses a minimal manual harness: mount a host component
 * with react-dom/client + React 19's `act`, capture the hook's return value
 * via a closure, and drive it exactly like customer-payments.test.ts drives
 * a real sql.js-backed query function.
 */
describe("usePOSPayment loyalty gating", () => {
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
    db.run(
      `DELETE FROM loyalty_transactions; DELETE FROM sale_items; DELETE FROM sales; DELETE FROM customers;`,
    );
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

  const customer = { id: "c1", first_name: "Jane", loyalty_points: 100 } as any;
  const cartItem = {
    id: "p1",
    name: "Panadol",
    unit_price: 100,
    cost_price: 50,
    quantity: 1,
    subtotal: 100,
  } as any;

  it("writes no loyalty_transactions rows when canUseLoyaltyProgram is false, even with points earned and a redemption staged", async () => {
    db.run(
      `INSERT INTO customers (id, first_name, loyalty_points) VALUES ('c1', 'Jane', 100)`,
    );

    const handle = renderPayment({
      cart: [cartItem],
      subtotal: 100,
      tax: 0,
      total: 280,
      discount: 20,
      redeemedOption: { id: "r1", label: "20 off", pointsCost: 50, discountValue: 20 },
      selectedCustomer: customer,
      clearCart: () => {},
      refetchProducts: () => {},
      canUseLoyaltyProgram: false,
    });

    act(() => {
      handle.get().setAmountPaid("280");
    });

    await act(async () => {
      await handle.get().handlePayment();
    });

    const rows = db.exec(`SELECT type FROM loyalty_transactions WHERE customer_id = 'c1'`);
    expect(rows).toEqual([]);
  });

  it("still writes both earn and redeem loyalty_transactions rows when canUseLoyaltyProgram is true (control case)", async () => {
    db.run(
      `INSERT INTO customers (id, first_name, loyalty_points) VALUES ('c1', 'Jane', 100)`,
    );

    const handle = renderPayment({
      cart: [cartItem],
      subtotal: 100,
      tax: 0,
      total: 280,
      discount: 20,
      redeemedOption: { id: "r1", label: "20 off", pointsCost: 50, discountValue: 20 },
      selectedCustomer: customer,
      clearCart: () => {},
      refetchProducts: () => {},
      canUseLoyaltyProgram: true,
    });

    act(() => {
      handle.get().setAmountPaid("280");
    });

    await act(async () => {
      await handle.get().handlePayment();
    });

    const rows = db.exec(
      `SELECT type FROM loyalty_transactions WHERE customer_id = 'c1' ORDER BY type`,
    );
    expect(rows[0].values.map((v) => v[0])).toEqual(["earned", "redeemed"]);
  });
});
