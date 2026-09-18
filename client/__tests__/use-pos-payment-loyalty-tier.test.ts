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
 * Coverage for wiring loyalty_tiers.points_multiplier into actual points
 * earning at checkout (previously configured/displayed in Settings but never
 * applied - see getApplicableTierMultiplier in loyalty-calculator.ts).
 */
describe("usePOSPayment loyalty tier multiplier", () => {
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
      `DELETE FROM loyalty_transactions; DELETE FROM loyalty_tiers; DELETE FROM sale_items; DELETE FROM sales; DELETE FROM customers;`,
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
    return { get: () => hookResult };
  }

  const cartItem = {
    id: "p1",
    name: "Cement Bag",
    unit_price: 1000,
    cost_price: 500,
    quantity: 1,
    subtotal: 1000,
  } as any;

  it("earns points at 1x when the customer's prior spend qualifies for no tier above the base", async () => {
    db.run(
      `INSERT INTO customers (id, first_name, loyalty_points) VALUES ('c1', 'Jane', 0)`,
    );
    db.run(
      `INSERT INTO loyalty_tiers (id, name, min_spend, points_multiplier) VALUES
        ('t1', 'Bronze', 0, 1),
        ('t2', 'Silver', 100000, 1.5)`,
    );

    const handle = renderPayment({
      cart: [cartItem],
      subtotal: 1000,
      tax: 0,
      total: 1000,
      discount: 0,
      selectedCustomer: { id: "c1", first_name: "Jane", loyalty_points: 0 } as any,
      clearCart: () => {},
      refetchProducts: () => {},
      canUseLoyaltyProgram: true,
      loyaltyPointsPerCurrency: 0.01,
    });

    act(() => handle.get().setAmountPaid("1000"));
    await act(async () => {
      await handle.get().handlePayment();
    });

    // 1000 * 0.01 * 1x = 10.
    const rows = db.exec(`SELECT points_earned FROM sales WHERE customer_id = 'c1'`);
    expect(rows[0].values[0][0]).toBe(10);
  });

  it("multiplies earned points by the tier matching the customer's spend before this sale", async () => {
    db.run(
      `INSERT INTO customers (id, first_name, loyalty_points) VALUES ('c1', 'Jane', 0)`,
    );
    // Prior spend of 150,000 already qualifies for the Silver tier (1.5x)
    // before this sale even happens.
    db.run(
      `INSERT INTO sales (id, transaction_number, customer_id, subtotal, total_amount, _deleted) VALUES
        ('prior1', 'TXN-PRIOR', 'c1', 150000, 150000, 0)`,
    );
    db.run(
      `INSERT INTO loyalty_tiers (id, name, min_spend, points_multiplier) VALUES
        ('t1', 'Bronze', 0, 1),
        ('t2', 'Silver', 100000, 1.5)`,
    );

    const handle = renderPayment({
      cart: [cartItem],
      subtotal: 1000,
      tax: 0,
      total: 1000,
      discount: 0,
      selectedCustomer: { id: "c1", first_name: "Jane", loyalty_points: 0 } as any,
      clearCart: () => {},
      refetchProducts: () => {},
      canUseLoyaltyProgram: true,
      loyaltyPointsPerCurrency: 0.01,
    });

    act(() => handle.get().setAmountPaid("1000"));
    await act(async () => {
      await handle.get().handlePayment();
    });

    // 1000 * 0.01 * 1.5x = 15, on the NEW sale - the prior sale's own total
    // (150,000) is what qualifies the tier, not counted twice.
    const rows = db.exec(
      `SELECT points_earned FROM sales WHERE customer_id = 'c1' AND transaction_number != 'TXN-PRIOR'`,
    );
    expect(rows[0].values[0][0]).toBe(15);
  });

  it("uses the store's configured earn rate instead of the hardcoded default", async () => {
    db.run(
      `INSERT INTO customers (id, first_name, loyalty_points) VALUES ('c1', 'Jane', 0)`,
    );

    const handle = renderPayment({
      cart: [cartItem],
      subtotal: 1000,
      tax: 0,
      total: 1000,
      discount: 0,
      selectedCustomer: { id: "c1", first_name: "Jane", loyalty_points: 0 } as any,
      clearCart: () => {},
      refetchProducts: () => {},
      canUseLoyaltyProgram: true,
      loyaltyPointsPerCurrency: 0.05,
    });

    act(() => handle.get().setAmountPaid("1000"));
    await act(async () => {
      await handle.get().handlePayment();
    });

    // 1000 * 0.05 * 1x (no tiers configured -> default multiplier) = 50.
    const rows = db.exec(`SELECT points_earned FROM sales WHERE customer_id = 'c1'`);
    expect(rows[0].values[0][0]).toBe(50);
  });
});
