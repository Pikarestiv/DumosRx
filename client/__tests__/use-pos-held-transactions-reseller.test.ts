import { describe, it, expect, beforeEach, vi } from "vitest";
import React, { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { HeldTransaction } from "@/lib/db/queries/sales";

vi.mock("idb-keyval", () => ({
  get: vi.fn(async () => undefined),
  set: vi.fn(async () => undefined),
}));

vi.mock("@/lib/context/store-context", () => ({
  useStore: () => ({ vatPercentage: 7.5 }),
}));

vi.mock("@/lib/hooks/use-feature-gate", () => ({
  useFeatureGate: () => ({ canUseLoyaltyProgram: false }),
}));

vi.mock("@/lib/db/local-database", () => ({
  insert: vi.fn(async () => undefined),
  remove: vi.fn(async () => undefined),
}));

vi.mock("sonner", () => ({
  toast: {
    success: vi.fn(),
    warning: vi.fn(),
    error: vi.fn(),
  },
}));

(globalThis as any).IS_REACT_ACT_ENVIRONMENT = true;

describe("usePOSHeldTransactions recall + reseller mode", () => {
  let usePOSCart: typeof import("@/lib/hooks/use-pos-cart").usePOSCart;
  let usePOSHeldTransactions: typeof import("@/lib/hooks/use-pos-held-transactions").usePOSHeldTransactions;
  let container: HTMLDivElement;
  let root: Root;

  // Catalog price has since changed to 120, but the held transaction was
  // saved at 100 (its unit_price at hold time). The recall path always
  // rebuilds from the current catalog product per its existing design.
  const product = {
    id: "p1",
    name: "Cement Bag",
    generic_name: "",
    strength: "",
    unit_price: 120,
    stock: 50,
  } as any;

  beforeEach(async () => {
    vi.resetModules();
    usePOSCart = (await import("@/lib/hooks/use-pos-cart")).usePOSCart;
    usePOSHeldTransactions = (
      await import("@/lib/hooks/use-pos-held-transactions")
    ).usePOSHeldTransactions;
    window.localStorage.clear();
    container = document.createElement("div");
    document.body.appendChild(container);
    root = createRoot(container);
  });

  function renderHooks() {
    let cartResult!: ReturnType<typeof usePOSCart>;
    let heldResult!: ReturnType<typeof usePOSHeldTransactions>;
    const queryClient = new QueryClient();
    function TestHost() {
      cartResult = usePOSCart([product]);
      heldResult = usePOSHeldTransactions({
        cart: cartResult.cart,
        total: cartResult.total,
        discount: cartResult.discount,
        discountType: cartResult.discountType,
        selectedCustomer: null,
        clearCart: cartResult.clearCart,
        setSelectedCustomer: () => {},
        products: [product],
        restoreCart: cartResult.restoreCart,
        customers: [],
        setShowHeldDialog: () => {},
      });
      return null;
    }
    act(() => {
      root.render(
        React.createElement(
          QueryClientProvider,
          { client: queryClient },
          React.createElement(TestHost),
        ),
      );
    });
    return { cart: () => cartResult, held: () => heldResult };
  }

  it("sets original_unit_price on recall when items_json has it, and updateUnitPrice stays finite", async () => {
    const handle = renderHooks();
    const held: HeldTransaction = {
      id: "held_1",
      customer_id: null,
      customer_name: "Walk-in Customer",
      items_json: JSON.stringify([
        {
          id: "p1",
          product_id: "p1",
          quantity: 2,
          unit_price: 100,
          original_unit_price: 100,
          subtotal: 200,
        },
      ]),
      total_amount: 200,
      discount: 0,
      discount_type: "fixed",
      created_at: new Date().toISOString(),
    };

    await act(async () => {
      await handle.held().handleRecallTransaction(held);
    });

    const recalledItem = handle.cart().cart[0];
    expect(recalledItem).toBeDefined();
    expect(recalledItem.original_unit_price).toBe(120);
    expect(Number.isNaN(recalledItem.original_unit_price)).toBe(false);

    act(() => handle.cart().updateUnitPrice("p1", 50));
    expect(Number.isNaN(handle.cart().cart[0].unit_price)).toBe(false);
    // Clamped to the floor (current catalog price), not NaN.
    expect(handle.cart().cart[0].unit_price).toBe(120);

    act(() => handle.cart().updateUnitPrice("p1", 150));
    expect(handle.cart().cart[0].unit_price).toBe(150);
  });

  it("sets original_unit_price on recall even when items_json is missing it entirely (pre-feature held transaction)", async () => {
    const handle = renderHooks();
    const held: HeldTransaction = {
      id: "held_2",
      customer_id: null,
      customer_name: "Walk-in Customer",
      // No original_unit_price field at all - simulates a transaction held
      // before this feature shipped.
      items_json: JSON.stringify([
        { id: "p1", product_id: "p1", quantity: 1, unit_price: 100, subtotal: 100 },
      ]),
      total_amount: 100,
      discount: 0,
      discount_type: "fixed",
      created_at: new Date().toISOString(),
    };

    await act(async () => {
      await handle.held().handleRecallTransaction(held);
    });

    const recalledItem = handle.cart().cart[0];
    expect(recalledItem.original_unit_price).toBe(120);
    expect(Number.isNaN(recalledItem.original_unit_price)).toBe(false);

    act(() => handle.cart().updateUnitPrice("p1", 10));
    expect(Number.isNaN(handle.cart().cart[0].unit_price)).toBe(false);
    expect(handle.cart().cart[0].unit_price).toBe(120);
  });
});
