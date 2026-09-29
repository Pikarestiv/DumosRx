import { describe, it, expect, vi, beforeEach } from "vitest";
import { act, renderHook } from "@testing-library/react";

const warnings: string[] = [];

vi.mock("sonner", () => ({
  toast: Object.assign((message: string) => void message, {
    success: vi.fn(),
    error: vi.fn(),
    warning: (message: string) => {
      warnings.push(message);
    },
    info: vi.fn(),
  }),
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
    cost_price: 60,
    stock: 20,
    ...overrides,
  } as Product;
}

/**
 * A-17. The POS cart is a zustand `persist` store: a line snapshots the
 * product's selling price and average cost when it is added and keeps them
 * forever. A cart held overnight, or one held across a price change synced
 * from the owner's device, was charged at the old price and booked COGS at
 * the old average cost. Cart lines are now re-priced from the catalog the
 * cart hook is already given, and the cashier is warned when a line's price
 * moved under them.
 */
describe("POS cart re-prices persisted lines from the current catalog", () => {
  beforeEach(() => {
    warnings.length = 0;
    clearPOSCartStorage();
  });

  it("re-prices a held line when the catalog's selling price has changed", () => {
    const oldCatalog = [product()];
    const { result, rerender } = renderHook(
      ({ products }: { products: Product[] }) => usePOSCart(products),
      { initialProps: { products: oldCatalog } },
    );

    act(() => result.current.addToCart(oldCatalog[0]));
    act(() => result.current.updateQuantity("p1", 3));
    expect(result.current.cart[0].unit_price).toBe(100);

    // Same cart, next morning: the owner's price change has synced in.
    rerender({ products: [product({ unit_price: 120 })] });

    expect(result.current.cart[0].unit_price).toBe(120);
    expect(result.current.cart[0].original_unit_price).toBe(120);
    expect(result.current.cart[0].subtotal).toBe(360);
    expect(result.current.subtotal).toBe(360);
    expect(result.current.total).toBe(360);
  });

  it("refreshes the line's cost price, so COGS is not booked at a stale average cost", () => {
    const oldCatalog = [product()];
    const { result, rerender } = renderHook(
      ({ products }: { products: Product[] }) => usePOSCart(products),
      { initialProps: { products: oldCatalog } },
    );

    act(() => result.current.addToCart(oldCatalog[0]));
    expect(result.current.cart[0].cost_price).toBe(60);

    rerender({ products: [product({ cost_price: 75 })] });

    expect(result.current.cart[0].cost_price).toBe(75);
  });

  it("warns the cashier once when a held line's price moved", () => {
    const oldCatalog = [product()];
    const { result, rerender } = renderHook(
      ({ products }: { products: Product[] }) => usePOSCart(products),
      { initialProps: { products: oldCatalog } },
    );

    act(() => result.current.addToCart(oldCatalog[0]));
    warnings.length = 0;

    rerender({ products: [product({ unit_price: 120 })] });

    expect(warnings).toHaveLength(1);
    expect(warnings[0]).toContain("Panadol");

    // A re-render with the same catalog must not warn again, or the POS
    // would nag on every keystroke.
    rerender({ products: [product({ unit_price: 120 })] });
    expect(warnings).toHaveLength(1);
  });

  it("keeps a reseller markup as a markup over the new catalog floor", () => {
    const oldCatalog = [product()];
    const { result, rerender } = renderHook(
      ({ products }: { products: Product[] }) => usePOSCart(products),
      { initialProps: { products: oldCatalog } },
    );

    act(() => result.current.addToCart(oldCatalog[0]));
    act(() => result.current.setIsResellerSale(true));
    act(() => result.current.updateUnitPrice("p1", 130));
    expect(result.current.cart[0].unit_price).toBe(130);

    rerender({ products: [product({ unit_price: 120 })] });

    // The ₦30 markup the cashier agreed with the reseller survives; the
    // floor it can never go below is now the new catalog price.
    expect(result.current.cart[0].original_unit_price).toBe(120);
    expect(result.current.cart[0].unit_price).toBe(150);
  });

  it("leaves a line alone while the catalog is still loading (empty or missing product)", () => {
    const oldCatalog = [product()];
    const { result, rerender } = renderHook(
      ({ products }: { products: Product[] }) => usePOSCart(products),
      { initialProps: { products: oldCatalog } },
    );

    act(() => result.current.addToCart(oldCatalog[0]));

    rerender({ products: [] });
    expect(result.current.cart[0].unit_price).toBe(100);

    rerender({ products: [product({ id: "p2", name: "Other" })] });
    expect(result.current.cart[0].unit_price).toBe(100);
    expect(warnings).toHaveLength(0);
  });

  it("does not touch a line whose catalog price is unchanged", () => {
    const catalog = [product()];
    const { result, rerender } = renderHook(
      ({ products }: { products: Product[] }) => usePOSCart(products),
      { initialProps: { products: catalog } },
    );

    act(() => result.current.addToCart(catalog[0]));
    const before = result.current.cart[0];

    rerender({ products: [product()] });

    expect(result.current.cart[0]).toBe(before);
    expect(warnings).toHaveLength(0);
  });
});
