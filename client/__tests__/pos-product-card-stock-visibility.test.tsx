import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import type { POSProduct } from "@/lib/types/product";

const visibility = vi.hoisted(() => ({ canSee: true }));

vi.mock("@/lib/context/store-context", () => ({
  useStore: () => ({ storeProfile: {} }),
}));

vi.mock("@/lib/hooks/use-permissions", () => ({
  useHasPermission: (key: string) => key !== "view_stock_quantities" || visibility.canSee,
}));

import { POSProductCard, type GroupedProduct } from "@/components/pos/pos-product-list";

function renderCard(stock: number, canSee: boolean, displayStockLevels: boolean) {
  visibility.canSee = canSee;
  const product = {
    id: "p1",
    name: "Panadol",
    unit_price: 100,
    stock,
    reorder_level: 5,
    posGroup: "standard",
  } as GroupedProduct & POSProduct;
  return render(
    <POSProductCard product={product} addToCart={() => {}} displayStockLevels={displayStockLevels} />,
  );
}

describe("POS tile stock chip and view_stock_quantities", () => {
  it.each([
    [40, true, "40 left"],
    [3, true, "3 left"],
    [40, false, "In stock"],
    [3, false, "Low stock"],
    [0, true, "Out of stock"],
    [0, false, "Out of stock"],
  ])("stock %s, canSee %s shows %s", (stock, canSee, expected) => {
    renderCard(stock, canSee, true);
    expect(screen.getByText(expected)).toBeTruthy();
  });

  it("renders no on-hand number without the permission", () => {
    const { container } = renderCard(37, false, true);
    expect(container.textContent).not.toContain("37");
  });

  it("shows no chip at all when the store hides stock levels, whatever the permission", () => {
    renderCard(40, true, false);
    expect(screen.queryByText(/left|In stock/)).toBeNull();
  });

  it("greys a zero-stock tile even when the store hides stock levels", () => {
    renderCard(0, false, false);
    expect(screen.getByRole("button").getAttribute("aria-disabled")).toBe("true");
    expect(screen.queryByText("Out of stock")).toBeNull();
  });
});
