import { describe, it, expect, vi, beforeEach } from "vitest";
import { act, renderHook } from "@testing-library/react";

const toasts = vi.hoisted(() => ({ warning: [] as string[], error: [] as string[] }));
const visibility = vi.hoisted(() => ({ canSeeQuantities: true }));

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
  useFeatureGate: () => ({ canUseLoyaltyProgram: true }),
}));

vi.mock("@/lib/hooks/use-stock-visibility", () => ({
  useStockVisibility: () => ({ canSeeQuantities: visibility.canSeeQuantities }),
}));

import { usePOSCart, clearPOSCartStorage, type Product } from "@/lib/hooks/use-pos-cart";

const product = (stock: number) => ({ id: "p1", name: "Panadol", unit_price: 100, stock }) as Product;

function fillToCap(canSeeQuantities: boolean) {
  visibility.canSeeQuantities = canSeeQuantities;
  const products = [product(2)];
  const { result } = renderHook(() => usePOSCart(products));
  act(() => result.current.addToCart(products[0]));
  act(() => result.current.addToCart(products[0]));
  act(() => result.current.addToCart(products[0]));
  act(() => result.current.updateQuantity("p1", 5));
  return result;
}

describe("POS cart stock toasts and view_stock_quantities", () => {
  beforeEach(() => {
    toasts.warning.length = 0;
    toasts.error.length = 0;
    clearPOSCartStorage();
  });

  it("names no number on the add and increment toasts without the permission", () => {
    fillToCap(false);

    expect(toasts.warning).toHaveLength(2);
    for (const message of toasts.warning) {
      expect(message).not.toMatch(/\d/);
      expect(message).toBe("Not enough stock for that quantity");
    }
  });

  it("keeps today's wording with the permission", () => {
    fillToCap(true);

    expect(toasts.warning).toEqual([
      "Insufficient stock — only 2 units available",
      "Insufficient stock — only 2 units available",
    ]);
  });

  it.each([true, false])("still refuses a zero-stock item either way (canSee=%s)", (canSee) => {
    visibility.canSeeQuantities = canSee;
    const products = [product(0)];
    const { result } = renderHook(() => usePOSCart(products));

    act(() => result.current.addToCart(products[0]));

    expect(result.current.cart).toHaveLength(0);
    expect(toasts.error).toEqual(["This item is out of stock"]);
  });
});
