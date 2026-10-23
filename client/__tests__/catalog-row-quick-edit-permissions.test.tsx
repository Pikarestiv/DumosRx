import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import React from "react";
import { CatalogRow } from "@/components/products/catalog-row";
import type { Product } from "@/components/products/types";

// The row half of the catalog gates:
// Rationale: docs/CLIENT_COMMENTS.md#block-__tests__-catalog-row-quick-edit-permissions-test-tsx-L7

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
      showStockQuantity
      hasTouchCapability={false}
      canPrintLabels
      canDeleteProducts
      formatCurrency={(n) => `N${n}`}
      onSelect={() => {}}
      onSaveCategory={() => {}}
      onSaveSellingPrice={() => {}}
      onSaveStockQuantity={() => {}}
      onSaveReorderLevel={() => {}}
      onPrintLabel={() => {}}
      onDeleteProduct={() => {}}
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

  it("shows a status word and no on-hand number when showStockQuantity is false", () => {
    renderRow({ showStockQuantity: false });
    expect(screen.queryByText("In stock")).not.toBeNull();
    expect(screen.queryByText(/12 units/)).toBeNull();
    expect(screen.queryByLabelText(/Edit stock quantity for Panadol/)).toBeNull();
  });

  it("uses the low-stock word on the mobile row without the number", () => {
    const { container } = renderRow({
      isDesktop: false,
      showStockQuantity: false,
      product: { ...product, stockQuantity: 4 },
    });
    expect(screen.queryByText("Low stock")).not.toBeNull();
    expect(container.textContent).not.toContain("4 units");
  });
});
