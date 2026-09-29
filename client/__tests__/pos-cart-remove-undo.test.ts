import { describe, it, expect, vi, beforeEach } from "vitest";
import { act, renderHook } from "@testing-library/react";

const toastCalls: { message: string; options?: { action?: { label: string; onClick: () => void } } }[] = [];

vi.mock("sonner", () => ({
  toast: Object.assign(
    (message: string, options?: { action?: { label: string; onClick: () => void } }) => {
      toastCalls.push({ message, options });
    },
    {
      success: vi.fn(),
      error: vi.fn(),
      warning: vi.fn(),
      info: vi.fn(),
    },
  ),
}));

vi.mock("@/lib/context/store-context", () => ({
  useStore: () => ({ vatPercentage: 0 }),
}));

vi.mock("@/lib/hooks/use-feature-gate", () => ({
  useFeatureGate: () => ({ canUseLoyaltyProgram: true }),
}));

import { usePOSCart, clearPOSCartStorage, type Product } from "@/lib/hooks/use-pos-cart";

function product(overrides: Partial<Product> = {}): Product {
  return {
    id: "p1",
    name: "Panadol",
    unit_price: 100,
    stock: 20,
    ...overrides,
  } as Product;
}

/**
 * U12: an accidental swipe on a cart line silently dropped it — no toast, no
 * undo. Removal now toasts with an Undo action that puts the line back at
 * the quantity it had.
 */
describe("POS cart removal undo", () => {
  beforeEach(() => {
    toastCalls.length = 0;
    clearPOSCartStorage();
  });

  it("toasts with an Undo action that restores the line at its prior quantity", () => {
    const products = [product()];
    const { result } = renderHook(() => usePOSCart(products));

    act(() => result.current.addToCart(products[0]));
    act(() => result.current.updateQuantity("p1", 3));
    expect(result.current.cart[0].quantity).toBe(3);

    act(() => result.current.removeFromCart("p1"));
    expect(result.current.cart).toHaveLength(0);

    const undoToast = toastCalls.find((c) => c.options?.action?.label === "Undo");
    expect(undoToast).toBeTruthy();
    expect(undoToast!.message).toContain("Panadol");

    act(() => undoToast!.options!.action!.onClick());
    expect(result.current.cart).toHaveLength(1);
    expect(result.current.cart[0].quantity).toBe(3);
    expect(result.current.cart[0].subtotal).toBe(300);
  });

  it("does not duplicate the line if Undo is pressed twice", () => {
    const products = [product()];
    const { result } = renderHook(() => usePOSCart(products));

    act(() => result.current.addToCart(products[0]));
    act(() => result.current.removeFromCart("p1"));

    const undoToast = toastCalls.find((c) => c.options?.action?.label === "Undo");
    act(() => undoToast!.options!.action!.onClick());
    act(() => undoToast!.options!.action!.onClick());

    expect(result.current.cart).toHaveLength(1);
  });
});
