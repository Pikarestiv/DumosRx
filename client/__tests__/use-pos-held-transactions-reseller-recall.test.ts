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
  useStore: () => ({ vatPercentage: 0 }),
}));

vi.mock("@/lib/hooks/use-feature-gate", () => ({
  useFeatureGate: () => ({ canUseLoyaltyProgram: false }),
}));

const insertMock = vi.fn(async () => undefined);
const removeMock = vi.fn(async () => undefined);
vi.mock("@/lib/db/local-database", () => ({
  insert: (...args: unknown[]) => insertMock(...(args as [])),
  remove: (...args: unknown[]) => removeMock(...(args as [])),
}));

const toastMock = {
  success: vi.fn(),
  warning: vi.fn(),
  error: vi.fn(),
  info: vi.fn(),
};
vi.mock("sonner", () => ({ toast: toastMock }));

(globalThis as any).IS_REACT_ACT_ENVIRONMENT = true;

/**
 * A-59: holding a reseller sale dropped `is_reseller_sale`/`markup_type` and
 * re-quoted every line at the current catalog price, so the markup and the
 * agent's commission vanished — blamed on a generic "prices have changed"
 * toast. A-60: the cart was mutated to the recalled state before the held row
 * was deleted, so a failing delete left a recalled cart, a failure toast, and
 * the held sale still listed as recallable.
 */
describe("usePOSHeldTransactions — reseller recall and delete ordering", () => {
  let usePOSCart: typeof import("@/lib/hooks/use-pos-cart").usePOSCart;
  let usePOSHeldTransactions: typeof import("@/lib/hooks/use-pos-held-transactions").usePOSHeldTransactions;
  let container: HTMLDivElement;
  let root: Root;

  const product = {
    id: "p1",
    name: "Cement Bag",
    generic_name: "",
    strength: "",
    unit_price: 1000,
    stock: 50,
  } as any;

  beforeEach(async () => {
    vi.resetModules();
    insertMock.mockClear();
    removeMock.mockReset();
    removeMock.mockImplementation(async () => undefined);
    Object.values(toastMock).forEach((fn) => fn.mockClear());
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
        isResellerSale: cartResult.isResellerSale,
        markupType: cartResult.markupType,
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

  const resellerHeld: HeldTransaction = {
    id: "held_1",
    customer_id: null,
    customer_name: "Walk-in Customer",
    items_json: JSON.stringify([
      {
        id: "p1",
        product_id: "p1",
        quantity: 1,
        unit_price: 1200,
        original_unit_price: 1000,
        subtotal: 1200,
      },
    ]),
    total_amount: 1200,
    discount: 0,
    discount_type: "fixed",
    created_at: new Date().toISOString(),
    is_reseller_sale: 1,
    markup_type: "reseller",
  };

  it("persists is_reseller_sale/markup_type when holding a reseller sale", async () => {
    const handle = renderHooks();
    act(() => handle.cart().addToCart(product));
    act(() => handle.cart().setIsResellerSale(true));
    act(() => handle.cart().setMarkupType("reseller"));
    act(() => handle.cart().updateUnitPrice("p1", 1200));

    await act(async () => {
      await handle.held().handleHoldTransaction();
    });

    expect(insertMock).toHaveBeenCalledTimes(1);
    const [table, row] = insertMock.mock.calls[0] as unknown as [string, Record<string, unknown>];
    expect(table).toBe("held_transactions");
    expect(row.is_reseller_sale).toBe(1);
    expect(row.markup_type).toBe("reseller");
  });

  it("restores the markup, the reseller flag and the markup type on recall", async () => {
    const handle = renderHooks();

    await act(async () => {
      await handle.held().handleRecallTransaction(resellerHeld);
    });

    expect(handle.cart().isResellerSale).toBe(true);
    expect(handle.cart().markupType).toBe("reseller");
    const item = handle.cart().cart[0];
    expect(item.unit_price).toBe(1200);
    expect(item.original_unit_price).toBe(1000);
    expect(item.subtotal).toBe(1200);
  });

  it("does not blame a restored markup on a catalog price change", async () => {
    const handle = renderHooks();

    await act(async () => {
      await handle.held().handleRecallTransaction(resellerHeld);
    });

    expect(toastMock.info).not.toHaveBeenCalled();
  });

  it("still warns about a genuine catalog price change on a normal held sale", async () => {
    const handle = renderHooks();

    await act(async () => {
      await handle.held().handleRecallTransaction({
        ...resellerHeld,
        is_reseller_sale: 0,
        markup_type: null,
        items_json: JSON.stringify([
          {
            id: "p1",
            product_id: "p1",
            quantity: 1,
            unit_price: 800,
            original_unit_price: 800,
            subtotal: 800,
          },
        ]),
      });
    });

    expect(toastMock.info).toHaveBeenCalled();
    expect(handle.cart().cart[0].unit_price).toBe(1000);
  });

  it("leaves the cart untouched when deleting the held row fails", async () => {
    const handle = renderHooks();
    act(() => handle.cart().addToCart(product));
    removeMock.mockImplementation(async () => {
      throw new Error("Database is read-only in this tab");
    });

    await act(async () => {
      await handle.held().handleRecallTransaction(resellerHeld);
    });

    expect(toastMock.error).toHaveBeenCalled();
    // The pre-recall cart is still what the cashier has, and the held sale
    // was not applied at all - it is still there to be recalled properly.
    expect(handle.cart().cart).toHaveLength(1);
    expect(handle.cart().cart[0].unit_price).toBe(1000);
    expect(handle.cart().isResellerSale).toBe(false);
  });
});
