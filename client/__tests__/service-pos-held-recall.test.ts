import { describe, it, expect, beforeEach, vi } from "vitest";
import React, { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { HeldTransaction } from "@/lib/db/queries/sales";
import type { POSProduct as Product } from "@/lib/types/product";
import type { Service } from "@/lib/types/service";

vi.mock("@/lib/hooks/use-stock-visibility", () => ({
  useStockVisibility: () => ({ canSeeQuantities: true }),
}));

vi.mock("idb-keyval", () => ({
  get: vi.fn(() => Promise.resolve(undefined)),
  set: vi.fn(() => Promise.resolve(undefined)),
}));

vi.mock("@/lib/context/store-context", () => ({
  useStore: () => ({ vatPercentage: 0 }),
}));

vi.mock("@/lib/hooks/use-feature-gate", () => ({
  useFeatureGate: () => ({ canUseLoyaltyProgram: false }),
}));

const insertMock = vi.fn(() => Promise.resolve(undefined));
const removeMock = vi.fn(() => Promise.resolve(undefined));
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

(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

describe("usePOSHeldTransactions — mixed products and services recall", () => {
  let usePOSCart: typeof import("@/lib/hooks/use-pos-cart").usePOSCart;
  let usePOSHeldTransactions: typeof import("@/lib/hooks/use-pos-held-transactions").usePOSHeldTransactions;
  let container: HTMLDivElement;
  let root: Root;

  const testProduct: Product = {
    id: "prod-1",
    name: "Hair Shampoo",
    generic_name: "",
    strength: "",
    unit_price: 3500,
    stock: 20,
    cost_price: 2000,
    barcode: "BAR123",
    reorder_level: 5,
    category_id: "cat-1",
    shelf_location: "A1",
    sku: "SKU123",
  } as Product;

  const testService: Service = {
    id: "srv-1",
    store_id: "store-1",
    name: "Haircut & Styling",
    code: "SRV-HAIR",
    description: "Standard hair styling",
    category: "Salon",
    price: 5000,
    is_active: 1,
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  };

  beforeEach(async () => {
    vi.resetModules();
    insertMock.mockClear();
    removeMock.mockReset();
    removeMock.mockImplementation(() => Promise.resolve(undefined));
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

  function renderHooks(servicesList: Service[] = [testService]) {
    let cartResult!: ReturnType<typeof usePOSCart>;
    let heldResult!: ReturnType<typeof usePOSHeldTransactions>;
    const queryClient = new QueryClient();
    function TestHost() {
      cartResult = usePOSCart([testProduct]);
      heldResult = usePOSHeldTransactions({
        cart: cartResult.cart,
        total: cartResult.total,
        discount: cartResult.discount,
        discountType: cartResult.discountType,
        selectedCustomer: null,
        clearCart: cartResult.clearCart,
        setSelectedCustomer: () => {},
        products: [testProduct],
        services: servicesList,
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

  it("recalls a held sale with both products and services without dropping service items", async () => {
    const mixedHeld: HeldTransaction = {
      id: "held_mixed_1",
      customer_id: null,
      customer_name: "Walk-in Customer",
      items_json: JSON.stringify([
        {
          id: "prod-1",
          name: "Hair Shampoo",
          quantity: 2,
          unit_price: 3500,
          original_unit_price: 3500,
          subtotal: 7000,
          item_type: "product",
          stock: 20,
        },
        {
          id: "srv-1",
          name: "Haircut & Styling",
          quantity: 1,
          unit_price: 5000,
          original_unit_price: 5000,
          subtotal: 5000,
          item_type: "service",
          stock: null,
        },
      ]),
      total_amount: 12000,
      discount: 0,
      discount_type: "fixed",
      created_at: new Date().toISOString(),
      is_reseller_sale: 0,
      markup_type: null,
    };

    const handle = renderHooks([testService]);
    await act(async () => {
      await handle.held().handleRecallTransaction(mixedHeld);
    });

    const restoredCart = handle.cart().cart;
    expect(restoredCart).toHaveLength(2);

    const productLine = restoredCart.find((i) => i.id === "prod-1");
    expect(productLine).toBeDefined();
    expect(productLine?.quantity).toBe(2);
    expect(productLine?.unit_price).toBe(3500);
    expect(productLine?.subtotal).toBe(7000);

    const serviceLine = restoredCart.find((i) => i.id === "srv-1");
    expect(serviceLine).toBeDefined();
    expect(serviceLine?.item_type).toBe("service");
    expect(serviceLine?.quantity).toBe(1);
    expect(serviceLine?.unit_price).toBe(5000);
    expect(serviceLine?.subtotal).toBe(5000);
    expect(serviceLine?.stock).toBeNull();

    expect(removeMock).toHaveBeenCalledWith("held_transactions", "held_mixed_1");
    expect(toastMock.success).toHaveBeenCalledWith("Transaction recalled");
  });

  it("preserves agreed service price when catalog price changed during hold and informs cashier", async () => {
    const updatedService: Service = {
      ...testService,
      price: 6000, // Price bumped in catalog from 5000 to 6000
    };

    const heldWithOldPrice: HeldTransaction = {
      id: "held_mixed_repriced",
      customer_id: null,
      customer_name: "Walk-in Customer",
      items_json: JSON.stringify([
        {
          id: "srv-1",
          name: "Haircut & Styling",
          quantity: 2,
          unit_price: 5000,
          original_unit_price: 5000,
          subtotal: 10000,
          item_type: "service",
          stock: null,
        },
      ]),
      total_amount: 10000,
      discount: 0,
      discount_type: "fixed",
      created_at: new Date().toISOString(),
      is_reseller_sale: 0,
      markup_type: null,
    };

    const handle = renderHooks([updatedService]);
    await act(async () => {
      await handle.held().handleRecallTransaction(heldWithOldPrice);
    });

    const restoredCart = handle.cart().cart;
    expect(restoredCart).toHaveLength(1);
    // Agreed price is preserved
    expect(restoredCart[0].unit_price).toBe(5000);
    expect(restoredCart[0].original_unit_price).toBe(5000);
    expect(restoredCart[0].subtotal).toBe(10000);
    expect(restoredCart[0].stock).toBeNull();
    expect(toastMock.info).toHaveBeenCalledWith(
      "Catalog prices have changed for some services since held; original agreed pricing was preserved.",
    );
  });

  it("keeps a cashier's price override on an unrepriced service without claiming the catalog changed", async () => {
    const heldWithOverride: HeldTransaction = {
      id: "held_override",
      customer_id: null,
      customer_name: "Walk-in Customer",
      items_json: JSON.stringify([
        { id: "srv-1", name: "Haircut & Styling", quantity: 1, unit_price: 4500, original_unit_price: 5000, subtotal: 4500, item_type: "service", stock: null },
      ]),
      total_amount: 4500,
      discount: 0,
      discount_type: "fixed",
      created_at: new Date().toISOString(),
      is_reseller_sale: 0,
      markup_type: null,
    };

    const handle = renderHooks([testService]);
    await act(async () => {
      await handle.held().handleRecallTransaction(heldWithOverride);
    });

    const [restored] = handle.cart().cart;
    expect(restored.unit_price).toBe(4500);
    expect(restored.original_unit_price).toBe(5000);
    expect(toastMock.info).not.toHaveBeenCalled();
  });

  it("preserves service line and warns if service was deactivated while held", async () => {
    const heldWithDeletedService: HeldTransaction = {
      id: "held_mixed_deleted",
      customer_id: null,
      customer_name: "Walk-in Customer",
      items_json: JSON.stringify([
        {
          id: "srv-deactivated",
          name: "Inactive Spa Service",
          quantity: 1,
          unit_price: 4000,
          original_unit_price: 4000,
          subtotal: 4000,
          item_type: "service",
          stock: null,
        },
        {
          id: "prod-1",
          name: "Hair Shampoo",
          quantity: 1,
          unit_price: 3500,
          original_unit_price: 3500,
          subtotal: 3500,
          item_type: "product",
          stock: 20,
        },
      ]),
      total_amount: 7500,
      discount: 0,
      discount_type: "fixed",
      created_at: new Date().toISOString(),
      is_reseller_sale: 0,
      markup_type: null,
    };

    // Catalog does not contain srv-deactivated
    const handle = renderHooks([testService]);
    await act(async () => {
      await handle.held().handleRecallTransaction(heldWithDeletedService);
    });

    const restoredCart = handle.cart().cart;
    // Both product and service preserved (not discarded)
    expect(restoredCart).toHaveLength(2);
    const preservedService = restoredCart.find((i) => i.id === "srv-deactivated");
    expect(preservedService).toBeDefined();
    expect(preservedService?.name).toBe("Inactive Spa Service");
    expect(preservedService?.unit_price).toBe(4000);
    expect(preservedService?.stock).toBeNull();
    expect(toastMock.warning).toHaveBeenCalledWith(
      "One or more services in this held sale are no longer active in the catalog. Preserved agreed quote.",
    );
  });
});
