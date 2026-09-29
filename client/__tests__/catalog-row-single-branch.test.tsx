import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
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

function renderRow(
  isDesktop: boolean,
  overrides: Partial<React.ComponentProps<typeof CatalogRow>> = {},
) {
  return render(
    <CatalogRow
      product={product()}
      isSelected={false}
      isDesktop={isDesktop}
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

  // The commitOnBlur={false} / ariaLabel wiring was merge-ported into this
  // component and only ever guarded at the underlying cell level, so nothing
  // caught CatalogRow dropping the props on the way through. A stock-quantity
  // commit writes a real inventory adjustment plus a permanent movement-ledger
  // row, so a stray blur on a half-typed number must not save (U5).
  it("labels each editable cell and never commits stock quantity on blur", () => {
    const onSaveStockQuantity = vi.fn();
    renderRow(true, { onSaveStockQuantity });

    const stockCell = screen.getByLabelText("Edit stock quantity for Panadol (12)");
    expect(screen.getByLabelText("Edit selling price for Panadol (N100)")).toBeTruthy();
    expect(screen.getByLabelText("Edit reorder level for Panadol (5)")).toBeTruthy();

    fireEvent.click(stockCell);
    fireEvent.change(screen.getByRole("spinbutton"), { target: { value: "999" } });
    fireEvent.blur(screen.getByRole("spinbutton"));

    expect(onSaveStockQuantity).not.toHaveBeenCalled();

    // Blur abandons the edit and collapses the cell, so reopen it to prove an
    // explicit confirm still commits (the cell isn't simply read-only).
    fireEvent.click(screen.getByLabelText("Edit stock quantity for Panadol (12)"));
    fireEvent.change(screen.getByRole("spinbutton"), { target: { value: "20" } });
    fireEvent.keyDown(screen.getByRole("spinbutton"), { key: "Enter" });

    expect(onSaveStockQuantity).toHaveBeenCalledWith(expect.objectContaining({ id: "p1" }), 20);
  });
});
