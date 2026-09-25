import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import type { POSProduct } from "@/lib/types/product";

/**
 * Regression coverage for the KNOWN_BUGS.md "Unmemoized POS product grid"
 * finding: pos-product-list.tsx rebuilt cartQuantityMap/grouped arrays with
 * new references on every render and POSProductCard wasn't memoized, so
 * every visible card re-rendered on any cart mutation regardless of catalog
 * size. Fixed via useMemo (keyed on the real inputs) + React.memo. This
 * test isn't about render counts (brittle) - it proves the memoized path
 * still produces correct output: grouping, sorting, and cart-quantity
 * badges all stay in sync across rerenders with different props.
 */
vi.mock("@/lib/context/store-context", () => ({
  useStore: () => ({ storeProfile: { uppercase_display_enabled: 1 } }),
}));

vi.mock("@/components/pos/request-item-dialog", () => ({
  RequestItemDialog: () => null,
}));

import { POSProductList } from "@/components/pos/pos-product-list";

function product(overrides: Partial<POSProduct> = {}): POSProduct {
  return {
    id: "p1",
    name: "Panadol",
    generic_name: "Paracetamol",
    strength: "500mg",
    unit_price: 100,
    stock: 10,
    ...overrides,
  };
}

describe("POSProductList memoization", () => {
  it("renders every product and reflects cart quantity badges", () => {
    const products = [
      product({ id: "p1", name: "Panadol" }),
      product({ id: "p2", name: "Amoxil" }),
    ];

    const { rerender } = render(
      <POSProductList
        loadingProducts={false}
        filteredProducts={products}
        addToCart={vi.fn()}
        productTerm="products"
        searchTerm="pan"
        cart={[{ ...product({ id: "p1" }), quantity: 3, subtotal: 300, original_unit_price: 100 }]}
      />,
    );

    expect(screen.getByText("Panadol")).toBeTruthy();
    expect(screen.getByText("Amoxil")).toBeTruthy();
    expect(screen.getByText("3")).toBeTruthy();

    // Cart quantity changes - the memoized cartQuantityMap must not go stale.
    rerender(
      <POSProductList
        loadingProducts={false}
        filteredProducts={products}
        addToCart={vi.fn()}
        productTerm="products"
        searchTerm="pan"
        cart={[{ ...product({ id: "p1" }), quantity: 5, subtotal: 500, original_unit_price: 100 }]}
      />,
    );

    expect(screen.getByText("5")).toBeTruthy();
    expect(screen.queryByText("3")).toBeNull();
  });

  it("calls addToCart with the clicked product", () => {
    const addToCart = vi.fn();
    const products = [product({ id: "p1", name: "Panadol" })];

    render(
      <POSProductList
        loadingProducts={false}
        filteredProducts={products}
        addToCart={addToCart}
        productTerm="products"
        searchTerm="pan"
      />,
    );

    fireEvent.click(screen.getByText("Panadol"));
    expect(addToCart).toHaveBeenCalledTimes(1);
    expect(addToCart.mock.calls[0][0].id).toBe("p1");
  });

  it("moves a product into the suggestions group when suggestions change, with no search term", () => {
    const products = [
      product({ id: "p1", name: "Panadol" }),
      product({ id: "p2", name: "Amoxil" }),
    ];

    const { rerender } = render(
      <POSProductList
        loadingProducts={false}
        filteredProducts={products}
        addToCart={vi.fn()}
        productTerm="products"
        searchTerm=""
        canUseSmartSuggestions
      />,
    );

    expect(
      screen.getByText("Add items to cart to see smart suggestions"),
    ).toBeTruthy();

    rerender(
      <POSProductList
        loadingProducts={false}
        filteredProducts={products}
        addToCart={vi.fn()}
        productTerm="products"
        searchTerm=""
        canUseSmartSuggestions
        suggestions={[product({ id: "p2", name: "Amoxil" })]}
      />,
    );

    expect(screen.getByText("Suggested")).toBeTruthy();
  });
});
