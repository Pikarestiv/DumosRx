import { describe, it, expect, beforeAll, beforeEach, vi } from "vitest";
import React, { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import initSqlJs, { type Database } from "sql.js";

vi.mock("idb-keyval", () => ({
  get: vi.fn(async () => undefined),
  set: vi.fn(async () => undefined),
}));

(globalThis as any).IS_REACT_ACT_ENVIRONMENT = true;

describe("usePOSPayment reseller commission", () => {
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
    return { get: () => hookResult };
  }

  it("computes and stores commission as a % of the marked-up amount for a reseller sale", async () => {
    // One item marked up by 50 (100 -> 150), one left at normal price.
    const cartItem1 = {
      id: "p1", name: "Cement Bag", unit_price: 150, original_unit_price: 100,
      cost_price: 60, quantity: 1, subtotal: 150,
    } as any;
    const cartItem2 = {
      id: "p2", name: "Nails", unit_price: 20, original_unit_price: 20,
      cost_price: 10, quantity: 2, subtotal: 40,
    } as any;

    const handle = renderPayment({
      cart: [cartItem1, cartItem2],
      subtotal: 190,
      tax: 0,
      total: 190,
      discount: 0,
      selectedCustomer: null,
      clearCart: () => {},
      refetchProducts: () => {},
      isResellerSale: true,
      markupType: "reseller",
      resellerCommissionPercentage: 20,
    });

    act(() => handle.get().setAmountPaid("190"));
    await act(async () => {
      await handle.get().handlePayment();
    });

    // Markup = (150-100)*1 + (20-20)*2 = 50. Commission = 50 * 20% = 10.
    const rows = db.exec(
      `SELECT is_reseller_sale, markup_type, reseller_commission_percentage, reseller_commission_amount, reseller_markup_amount, reseller_commission_redeemed FROM sales`,
    );
    expect(rows[0].values[0]).toEqual([1, "reseller", 20, 10, 50, 0]);
  });

  it("pre-settles a store-markup sale at checkout - no commission owed, nothing pending", async () => {
    const cartItem = {
      id: "p1", name: "Cement Bag", unit_price: 150, original_unit_price: 100,
      cost_price: 60, quantity: 1, subtotal: 150,
    } as any;

    const handle = renderPayment({
      cart: [cartItem],
      subtotal: 150,
      tax: 0,
      total: 150,
      discount: 0,
      selectedCustomer: null,
      clearCart: () => {},
      refetchProducts: () => {},
      isResellerSale: true,
      markupType: "store",
      resellerCommissionPercentage: 20,
    });

    act(() => handle.get().setAmountPaid("150"));
    await act(async () => {
      await handle.get().handlePayment();
    });

    // Markup = 150-100 = 50, but store keeps it all - no commission, and
    // already marked redeemed/store_claim at checkout, not left pending.
    const rows = db.exec(
      `SELECT is_reseller_sale, markup_type, reseller_commission_amount, reseller_markup_amount, reseller_commission_redeemed, reseller_commission_claim_type FROM sales`,
    );
    expect(rows[0].values[0]).toEqual([1, "store", 0, 50, 1, "store_claim"]);
  });

  it("blocks checkout when reseller sale is on but no markup type was chosen", async () => {
    const cartItem = {
      id: "p1", name: "Cement Bag", unit_price: 150, original_unit_price: 100,
      cost_price: 60, quantity: 1, subtotal: 150,
    } as any;

    const handle = renderPayment({
      cart: [cartItem],
      subtotal: 150,
      tax: 0,
      total: 150,
      discount: 0,
      selectedCustomer: null,
      clearCart: () => {},
      refetchProducts: () => {},
      isResellerSale: true,
      resellerCommissionPercentage: 20,
    });

    act(() => handle.get().setAmountPaid("150"));
    await act(async () => {
      await handle.get().handlePayment();
    });

    const rows = db.exec(`SELECT COUNT(*) FROM sales`);
    expect(rows[0].values[0]).toEqual([0]);
  });

  it("writes no commission fields when isResellerSale is false, even if prices differ from original", async () => {
    const cartItem = {
      id: "p1", name: "Cement Bag", unit_price: 150, original_unit_price: 100,
      cost_price: 60, quantity: 1, subtotal: 150,
    } as any;

    const handle = renderPayment({
      cart: [cartItem],
      subtotal: 150,
      tax: 0,
      total: 150,
      discount: 0,
      selectedCustomer: null,
      clearCart: () => {},
      refetchProducts: () => {},
      isResellerSale: false,
      resellerCommissionPercentage: 20,
    });

    act(() => handle.get().setAmountPaid("150"));
    await act(async () => {
      await handle.get().handlePayment();
    });

    const rows = db.exec(
      `SELECT is_reseller_sale, reseller_commission_amount FROM sales`,
    );
    expect(rows[0].values[0]).toEqual([0, 0]);
  });
});
