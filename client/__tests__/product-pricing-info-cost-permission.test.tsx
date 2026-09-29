import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";

/**
 * Product Detail's Pricing card was the other half of the cost leak: the
 * profit block was gated by a direct `user?.role !== "sales_staff"` check
 * but the Avg Cost Price and Last Bought Price above it were shown to
 * everyone. "view_cost_fields" now fronts all three, and its default
 * grants (admin/manager/specialist/auditor, never sales_staff) reproduce
 * the old role check exactly for the profit block.
 */

const hasPermission = vi.fn((_key: string) => true);

vi.mock("@/lib/hooks/use-permissions", () => ({
  useHasPermission: (key: string) => hasPermission(key),
}));

import { ProductPricingInfo } from "@/components/products/product-details/product-pricing-info";
import type { Product } from "@/components/products/product-details/use-product-details";

const product = {
  costPrice: 50,
  sellingPrice: 120,
  lastBoughtPrice: 55,
  baseUnit: "unit",
} as Product;

function renderCard() {
  render(
    <ProductPricingInfo
      product={product}
      formatPrice={(n) => `N${n}`}
      profitMargin="58.3"
    />,
  );
}

describe("Product pricing info cost visibility", () => {
  beforeEach(() => {
    hasPermission.mockReset();
    hasPermission.mockImplementation(() => true);
  });

  it("checks the view_cost_fields key", () => {
    renderCard();
    expect(hasPermission).toHaveBeenCalledWith("view_cost_fields");
  });

  it("shows cost, last-bought and margin with view_cost_fields", () => {
    renderCard();
    expect(screen.queryByText("Avg. Cost Price")).not.toBeNull();
    expect(screen.queryByText("Last Bought Price")).not.toBeNull();
    expect(screen.queryByText("Profit Margin")).not.toBeNull();
  });

  it("hides every cost and margin figure without view_cost_fields", () => {
    hasPermission.mockImplementation((key: string) => key !== "view_cost_fields");
    renderCard();
    expect(screen.queryByText("Avg. Cost Price")).toBeNull();
    expect(screen.queryByText("Last Bought Price")).toBeNull();
    expect(screen.queryByText("Profit Margin")).toBeNull();
    expect(screen.queryByText(/Profit per/)).toBeNull();
  });

  it("still shows the selling price without view_cost_fields", () => {
    hasPermission.mockImplementation((key: string) => key !== "view_cost_fields");
    renderCard();
    expect(screen.queryByText("Selling Price")).not.toBeNull();
    expect(screen.queryByText("N120")).not.toBeNull();
  });
});
