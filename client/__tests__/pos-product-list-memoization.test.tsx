import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { createRef } from "react";
import type { POSProduct } from "@/lib/types/product";

// These tests exercise grouping/sorting/cart-quantity logic, not virtualization mechanics (that belongs in e2e/browser tes…
// Rationale: docs/CLIENT_COMMENTS.md#line-__tests__-pos-product-list-memoization-test-tsx-L6
vi.mock("@tanstack/react-virtual", () => ({
  useVirtualizer: ({ count, estimateSize }: { count: number; estimateSize: () => number }) => ({
    getVirtualItems: () =>
      Array.from({ length: count }, (_, index) => ({
        key: index,
        index,
        start: index * estimateSize(),
      })),
    getTotalSize: () => count * estimateSize(),
    measureElement: () => {},
  }),
}));

// Regression coverage for the KNOWN_BUGS.md "Unmemoized POS product grid" finding:
// Rationale: docs/CLIENT_COMMENTS.md#block-__tests__-pos-product-list-memoization-test-tsx-L25
vi.mock("@/lib/context/store-context", () => ({
  useStore: () => ({ storeProfile: { uppercase_display_enabled: 1 } }),
}));

vi.mock("@/lib/hooks/use-stock-visibility", () => ({
  useStockVisibility: () => ({ canSeeQuantities: true, describeStock: (qty: number) => `${qty} left` }),
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
        scrollElementRef={createRef<HTMLDivElement>()}
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
        scrollElementRef={createRef<HTMLDivElement>()}
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
        scrollElementRef={createRef<HTMLDivElement>()}
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
        scrollElementRef={createRef<HTMLDivElement>()}
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
        scrollElementRef={createRef<HTMLDivElement>()}
        searchTerm=""
        canUseSmartSuggestions
        suggestions={[product({ id: "p2", name: "Amoxil" })]}
      />,
    );

    expect(screen.getByText("Suggested")).toBeTruthy();
  });
});
