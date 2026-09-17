import { describe, it, expect, beforeEach, vi } from "vitest";
import React, { act } from "react";
import { createRoot, type Root } from "react-dom/client";

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

vi.mock("sonner", () => ({
  toast: {
    success: vi.fn(),
    warning: vi.fn(),
    error: vi.fn(),
  },
}));

(globalThis as any).IS_REACT_ACT_ENVIRONMENT = true;

describe("usePOSCart reseller mode", () => {
  let usePOSCart: typeof import("@/lib/hooks/use-pos-cart").usePOSCart;
  let container: HTMLDivElement;
  let root: Root;

  const product = {
    id: "p1",
    name: "Cement Bag",
    generic_name: "",
    strength: "",
    unit_price: 100,
    stock: 50,
  } as any;

  beforeEach(async () => {
    usePOSCart = (await import("@/lib/hooks/use-pos-cart")).usePOSCart;
    window.localStorage.clear();
    container = document.createElement("div");
    document.body.appendChild(container);
    root = createRoot(container);
  });

  function renderCart() {
    let hookResult!: ReturnType<typeof usePOSCart>;
    function TestHost() {
      hookResult = usePOSCart([product]);
      return null;
    }
    act(() => {
      root.render(React.createElement(TestHost));
    });
    return { get: () => hookResult };
  }

  it("clamps updateUnitPrice to never go below the item's original price", async () => {
    const handle = renderCart();
    act(() => handle.get().clearCart());
    act(() => handle.get().addToCart(product));

    act(() => handle.get().updateUnitPrice("p1", 150));
    expect(handle.get().cart[0].unit_price).toBe(150);
    expect(handle.get().cart[0].subtotal).toBe(150);

    act(() => handle.get().updateUnitPrice("p1", 50));
    expect(handle.get().cart[0].unit_price).toBe(100);
    expect(handle.get().cart[0].subtotal).toBe(100);
  });

  it("reverts all item prices to original when isResellerSale is turned off", async () => {
    const handle = renderCart();
    act(() => handle.get().clearCart());
    act(() => handle.get().addToCart(product));
    act(() => handle.get().setIsResellerSale(true));
    act(() => handle.get().updateUnitPrice("p1", 200));
    expect(handle.get().cart[0].unit_price).toBe(200);

    act(() => handle.get().setIsResellerSale(false));
    expect(handle.get().cart[0].unit_price).toBe(100);
    expect(handle.get().cart[0].subtotal).toBe(100);
    expect(handle.get().isResellerSale).toBe(false);
  });

  it("resets isResellerSale on clearCart", async () => {
    const handle = renderCart();
    act(() => handle.get().setIsResellerSale(true));
    act(() => handle.get().clearCart());
    expect(handle.get().isResellerSale).toBe(false);
  });
});
