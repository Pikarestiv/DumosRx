import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";
import React from "react";
import { CatalogRow } from "@/components/products/catalog-row";
import type { Product } from "@/components/products/types";

/**
 * catalog-list used to mount BOTH the mobile card and the desktop grid row for
 * every visible row inside the virtualizer, hiding one with CSS. With ~20 rows
 * on screen that meant ~80 stateful editable cells mounted where ~20 should be
 * visible. Each row now renders only the branch that is actually on screen, so
 * these pin that exactly one of the two is in the DOM at a time.
 */

vi.mock("@/lib/hooks/use-uppercase-display", () => ({
  useUppercaseDisplayClass: () => "capitalize",
  useUppercaseDisplay: () => false,
  capitalizeWords: (s: string) => s,
}));

function product(overrides: Partial<Product> = {}): Product {
  return {
    id: "p1",
    name: "Panadol",
    category: "Painkillers",
    costPrice: 50,
    sellingPrice: 100,
    stockQuantity: 12,
    reorderLevel: 5,
    baseUnit: "unit",
    ...overrides,
  } as Product;
}

function renderRow(isDesktop: boolean) {
  return render(
    <CatalogRow
      product={product()}
      isSelected={false}
      isDesktop={isDesktop}
      isPharmacy={false}
      capsClass="capitalize"
      categoryOptions={["Painkillers"]}
      canEdit
      hasTouchCapability={false}
      formatCurrency={(n) => `N${n}`}
      onSelect={() => {}}
      onSaveCategory={() => {}}
      onSaveSellingPrice={() => {}}
      onSaveStockQuantity={() => {}}
      onSaveReorderLevel={() => {}}
    />,
  );
}

describe("CatalogRow", () => {
  beforeEach(() => {
    if (!window.matchMedia) {
      window.matchMedia = ((query: string) => ({
        matches: false,
        media: query,
        onchange: null,
        addListener: () => {},
        removeListener: () => {},
        addEventListener: () => {},
        removeEventListener: () => {},
        dispatchEvent: () => false,
      })) as unknown as typeof window.matchMedia;
    }
  });

  it("mounts only the desktop branch at desktop width", () => {
    const { container } = renderRow(true);

    // The editable category cell only exists in the desktop branch.
    expect(screen.queryByLabelText(/Edit category/)).not.toBeNull();
    expect(container.querySelector("[data-catalog-row-mobile]")).toBeNull();
    expect(container.querySelector("[data-catalog-row-desktop]")).not.toBeNull();
  });

  it("mounts only the mobile branch at mobile width, with no editable cells", () => {
    const { container } = renderRow(false);

    expect(screen.queryByLabelText(/Edit category/)).toBeNull();
    expect(container.querySelector("[data-catalog-row-desktop]")).toBeNull();
    expect(container.querySelector("[data-catalog-row-mobile]")).not.toBeNull();
  });

  it("shows the product on both branches", () => {
    renderRow(true);
    expect(screen.getByText("Panadol")).toBeTruthy();
  });
});
