import { describe, it, expect, vi } from "vitest";
import React from "react";
import { render, screen } from "@testing-library/react";

vi.mock("@/lib/context/store-context", () => ({
  useStore: () => ({
    storeType: "pharmacy",
    storeProfile: { uppercase_display_enabled: 1 },
  }),
}));

vi.mock("@/lib/hooks/use-uppercase-display", () => ({
  useUppercaseDisplayClass: () => "capitalize",
  useUppercaseDisplay: () => false,
  capitalizeWords: (s: string) => s,
}));

import { CatalogRow } from "@/components/products/catalog-row";
import type { Product } from "@/components/products/types";

const mockProduct: Product = {
  id: "p1",
  name: "Paracetamol 500mg",
  category: "Pain Relief",
  costPrice: 50,
  sellingPrice: 100,
  stockQuantity: 0,
  reorderLevel: 5,
  baseUnit: "pack",
  status: "out_of_stock",
} as Product;

function renderCatalogRow(props: {
  showStockQuantity?: boolean;
  owedQuantity?: number;
  isDesktop?: boolean;
}) {
  return render(
    <CatalogRow
      product={mockProduct}
      isSelected={false}
      isDesktop={props.isDesktop ?? true}
      isPharmacy={true}
      capsClass=""
      categoryOptions={["Pain Relief"]}
      canEdit={true}
      showCostColumn={true}
      canEditSellingPrice={true}
      canAdjustStockQuantity={true}
      showStockQuantity={props.showStockQuantity ?? true}
      hasTouchCapability={false}
      canPrintLabels={true}
      canDeleteProducts={true}
      owedQuantity={props.owedQuantity ?? 0}
      formatCurrency={(amount) => `₦${amount}`}
      onSelect={vi.fn()}
      onSaveCategory={vi.fn()}
      onSaveSellingPrice={vi.fn()}
      onSaveStockQuantity={vi.fn()}
      onSaveReorderLevel={vi.fn()}
      onPrintLabel={vi.fn()}
      onDeleteProduct={vi.fn()}
    />,
  );
}

describe("CatalogRow stock owed badge", () => {
  it("renders '[N] owed' badge when stock is 0 and quantities are visible on desktop", () => {
    renderCatalogRow({ showStockQuantity: true, owedQuantity: 5, isDesktop: true });
    expect(screen.getByText("5 owed")).toBeTruthy();
  });

  it("renders 'Stock owed' badge without quantity when quantities are hidden on desktop", () => {
    renderCatalogRow({ showStockQuantity: false, owedQuantity: 5, isDesktop: true });
    expect(screen.getByText("Stock owed")).toBeTruthy();
    expect(screen.queryByText("5 owed")).toBeNull();
  });

  it("renders '[N] owed' badge when stock is 0 and quantities are visible on mobile", () => {
    renderCatalogRow({ showStockQuantity: true, owedQuantity: 3, isDesktop: false });
    expect(screen.getByText("3 owed")).toBeTruthy();
  });

  it("renders 'Stock owed' badge on mobile when quantities are hidden", () => {
    renderCatalogRow({ showStockQuantity: false, owedQuantity: 3, isDesktop: false });
    expect(screen.getByText("Stock owed")).toBeTruthy();
    expect(screen.queryByText("3 owed")).toBeNull();
  });

  it("does not render owed badge when owedQuantity is 0", () => {
    renderCatalogRow({ showStockQuantity: true, owedQuantity: 0, isDesktop: true });
    expect(screen.queryByText(/owed/i)).toBeNull();
  });
});
