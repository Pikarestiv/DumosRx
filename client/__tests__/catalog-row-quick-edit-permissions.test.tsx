import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import React from "react";
import { CatalogRow } from "@/components/products/catalog-row";
import type { Product } from "@/components/products/types";

/**
 * The row half of the catalog gates: a withheld key must leave the figure
 * on screen read-only rather than render a disabled control, and the Avg
 * Cost cell must disappear entirely (its grid column goes with it) rather
 * than render blank.
 */

vi.mock("@/lib/hooks/use-uppercase-display", () => ({
  useUppercaseDisplayClass: () => "capitalize",
  useUppercaseDisplay: () => false,
  capitalizeWords: (s: string) => s,
}));

const product = {
  id: "p1",
  name: "Panadol",
  category: "Painkillers",
  costPrice: 50,
  sellingPrice: 100,
  stockQuantity: 12,
  reorderLevel: 5,
  baseUnit: "unit",
} as Product;

function renderRow(
  overrides: Partial<React.ComponentProps<typeof CatalogRow>> = {},
) {
  return render(
    <CatalogRow
      product={product}
      isSelected={false}
      isDesktop
      isPharmacy={false}
      capsClass="capitalize"
      categoryOptions={["Painkillers"]}
      canEdit
      showCostColumn
      canEditSellingPrice
      canAdjustStockQuantity
      hasTouchCapability={false}
      formatCurrency={(n) => `N${n}`}
      onSelect={() => {}}
      onSaveCategory={() => {}}
      onSaveSellingPrice={() => {}}
      onSaveStockQuantity={() => {}}
      onSaveReorderLevel={() => {}}
      {...overrides}
    />,
  );
}

describe("CatalogRow inventory permission props", () => {
  it("renders the cost figure when showCostColumn is set", () => {
    renderRow();
    expect(screen.queryByText("N50")).not.toBeNull();
  });

  it("removes the cost cell entirely when showCostColumn is false", () => {
    renderRow({ showCostColumn: false });
    expect(screen.queryByText("N50")).toBeNull();
    expect(screen.queryByText("N100")).not.toBeNull();
  });

  it("keeps the selling price read-only when canEditSellingPrice is false", () => {
    renderRow({ canEditSellingPrice: false });
    expect(
      screen.queryByLabelText(/Edit selling price for Panadol/),
    ).toBeNull();
    expect(screen.queryByText("N100")).not.toBeNull();
  });

  it("keeps the stock quantity read-only when canAdjustStockQuantity is false", () => {
    renderRow({ canAdjustStockQuantity: false });
    expect(
      screen.queryByLabelText(/Edit stock quantity for Panadol/),
    ).toBeNull();
    expect(screen.queryByText(/12 units/)).not.toBeNull();
    expect(
      screen.queryByLabelText(/Edit reorder level for Panadol/),
    ).not.toBeNull();
  });
});
