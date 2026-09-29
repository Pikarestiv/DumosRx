import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { createRef } from "react";
import type { POSProduct } from "@/lib/types/product";

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

vi.mock("@/lib/context/store-context", () => ({
  useStore: () => ({ storeProfile: { uppercase_display_enabled: 1 } }),
}));

vi.mock("@/components/pos/request-item-dialog", () => ({
  RequestItemDialog: () => null,
}));

import { POSProductList } from "@/components/pos/pos-product-list";

/**
 * U1: a failed catalog read used to be indistinguishable from an empty
 * catalog — usePOSData coerced every query result with `|| []` and exposed
 * no isError, so the grid rendered "No products found - try a different
 * search term" for a read that never completed. The list must render a
 * distinct, retryable failure state instead.
 */
describe("POSProductList load failure", () => {
  const baseProps = {
    loadingProducts: false,
    filteredProducts: [] as POSProduct[],
    addToCart: vi.fn(),
    productTerm: "products",
    scrollElementRef: createRef<HTMLDivElement>(),
  };

  it("shows a load-failure message with a retry action instead of the empty state", () => {
    const onRetry = vi.fn();
    render(
      <POSProductList {...baseProps} productsLoadFailed onRetryLoadProducts={onRetry} />,
    );

    expect(screen.queryByText(/No products found/i)).toBeNull();
    expect(screen.getByText(/Couldn't load products on this device/i)).toBeTruthy();

    fireEvent.click(screen.getByRole("button", { name: /retry/i }));
    expect(onRetry).toHaveBeenCalledTimes(1);
  });

  it("still shows the empty state when the read succeeded with no rows", () => {
    render(<POSProductList {...baseProps} />);

    expect(screen.getByText(/No products found/i)).toBeTruthy();
    expect(screen.queryByText(/Couldn't load products on this device/i)).toBeNull();
  });
});
