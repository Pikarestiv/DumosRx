import { describe, it, expect, vi, beforeEach } from "vitest";
import { act, renderHook } from "@testing-library/react";

const toasts = vi.hoisted(() => ({ warning: [] as string[], error: [] as string[] }));
const flags = vi.hoisted(() => ({ canSeeQuantities: true, canSellWithoutStock: true }));

vi.mock("sonner", () => ({
  toast: Object.assign(vi.fn(), {
    success: vi.fn(),
    error: (message: string) => toasts.error.push(message),
    warning: (message: string) => toasts.warning.push(message),
    info: vi.fn(),
  }),
}));

vi.mock("@/lib/context/store-context", () => ({
  useStore: () => ({ vatPercentage: 0 }),
}));

vi.mock("@/lib/hooks/use-feature-gate", () => ({
  useFeatureGate: () => ({ canUseLoyaltyProgram: true, canSellWithoutStock: flags.canSellWithoutStock }),
}));

vi.mock("@/lib/hooks/use-stock-visibility", () => ({
  useStockVisibility: () => ({ canSeeQuantities: flags.canSeeQuantities }),
}));

import { usePOSCart, clearPOSCartStorage, type Product } from "@/lib/hooks/use-pos-cart";
import { formatBackorderWarning } from "@/lib/utils/stock-status";

const product = (stock: number) => ({ id: "p1", name: "Cement", unit_price: 100, stock }) as Product;

function cartWith(stock: number) {
  const products = [product(stock)];
  const { result } = renderHook(() => usePOSCart(products));
  return { result, item: products[0] };
}

describe("POS cart when the store sells past recorded stock", () => {
  beforeEach(() => {
    toasts.warning.length = 0;
    toasts.error.length = 0;
    flags.canSeeQuantities = true;
    flags.canSellWithoutStock = true;
    clearPOSCartStorage();
  });

  it("adds a zero-stock item with an owed warning instead of refusing it", () => {
    const { result, item } = cartWith(0);
    act(() => result.current.addToCart(item));

    expect(result.current.cart[0]?.quantity).toBe(1);
    expect(toasts.error).toEqual([]);
    expect(toasts.warning).toEqual(["Nothing in stock. 1 will be recorded as owed until stock is received."]);
  });

  it("lets the line pass stock and warns once, when it first crosses", () => {
    const { result, item } = cartWith(3);
    act(() => result.current.addToCart(item));
    act(() => result.current.updateQuantity("p1", 3));
    act(() => result.current.updateQuantity("p1", 5));
    act(() => result.current.updateQuantity("p1", 6));
    act(() => result.current.addToCart(item));

    expect(result.current.cart[0]?.quantity).toBe(7);
    expect(toasts.warning).toEqual(["Only 3 in stock. 2 will be recorded as owed until stock is received."]);
  });

  it("names no number to a role that cannot see quantities", () => {
    flags.canSeeQuantities = false;
    const { result, item } = cartWith(2);
    act(() => result.current.addToCart(item));
    act(() => result.current.updateQuantity("p1", 5));

    expect(toasts.warning).toEqual(["More than the recorded stock. The extra will be recorded as owed."]);
    expect(toasts.warning[0]).not.toMatch(/\d/);
  });

  it("still blocks both paths when the setting is off", () => {
    flags.canSellWithoutStock = false;
    const { result, item } = cartWith(0);
    act(() => result.current.addToCart(item));
    expect(result.current.cart).toHaveLength(0);
    expect(toasts.error).toEqual(["This item is out of stock"]);

    const stocked = cartWith(2);
    act(() => stocked.result.current.addToCart(stocked.item));
    act(() => stocked.result.current.updateQuantity("p1", 5));
    expect(stocked.result.current.cart[0]?.quantity).toBe(1);
  });

  it("words the warning per visibility", () => {
    expect(formatBackorderWarning(3, 5, true)).toBe("Only 3 in stock. 2 will be recorded as owed until stock is received.");
    expect(formatBackorderWarning(1, 2, true)).toBe("Only 1 in stock. 1 will be recorded as owed until stock is received.");
    expect(formatBackorderWarning(0, 4, false)).toBe("More than the recorded stock. The extra will be recorded as owed.");
  });
});
