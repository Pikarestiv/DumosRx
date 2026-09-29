import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, within } from "@testing-library/react";

if (!globalThis.ResizeObserver) {
  globalThis.ResizeObserver = class {
    observe() {}
    unobserve() {}
    disconnect() {}
  } as unknown as typeof ResizeObserver;
}

vi.mock("@/lib/hooks/use-uppercase-display", () => ({
  useUppercaseDisplayClass: () => "",
}));

import { CatalogRow } from "@/components/products/catalog-row";
import type { Product } from "@/components/products/types";

const product = {
  id: "p1-aaaaaaaa",
  name: "Paracetamol 500mg",
  category: "Analgesics",
  barcode: "5901234123457",
  costPrice: 800,
  sellingPrice: 1500,
  stockQuantity: 12,
  reorderLevel: 5,
  baseUnit: "pack",
} as unknown as Product;

const onSelect = vi.fn();
const onPrintLabel = vi.fn();
const onDeleteProduct = vi.fn();

function renderRow(
  overrides: Partial<React.ComponentProps<typeof CatalogRow>> = {},
) {
  return render(
    <CatalogRow
      product={product}
      isSelected={false}
      isDesktop
      isPharmacy
      capsClass=""
      categoryOptions={["Analgesics"]}
      canEdit
      showCostColumn
      canEditSellingPrice
      canAdjustStockQuantity
      hasTouchCapability={false}
      canPrintLabels
      canDeleteProducts
      formatCurrency={(n) => `N${n}`}
      onSelect={onSelect}
      onSaveCategory={vi.fn()}
      onSaveSellingPrice={vi.fn()}
      onSaveStockQuantity={vi.fn()}
      onSaveReorderLevel={vi.fn()}
      onPrintLabel={onPrintLabel}
      onDeleteProduct={onDeleteProduct}
      {...overrides}
    />,
  );
}

function openContextMenu() {
  const row = screen.getAllByRole("button")[0];
  fireEvent.contextMenu(row);
}

describe("Catalog row context menu", () => {
  beforeEach(() => {
    onSelect.mockReset();
    onPrintLabel.mockReset();
    onDeleteProduct.mockReset();
  });

  it("stays closed until the row is right-clicked", () => {
    renderRow();
    expect(screen.queryByRole("menuitem", { name: /View details/i })).toBeNull();
  });

  it("opens with all three actions on right-click", () => {
    renderRow();
    openContextMenu();
    expect(screen.getByRole("menuitem", { name: /View details/i })).toBeTruthy();
    expect(
      screen.getByRole("menuitem", { name: /Print barcode label/i }),
    ).toBeTruthy();
    expect(
      screen.getByRole("menuitem", { name: /Delete product/i }),
    ).toBeTruthy();
  });

  it("opens the product details panel from View details", () => {
    renderRow();
    openContextMenu();
    fireEvent.click(screen.getByRole("menuitem", { name: /View details/i }));
    expect(onSelect).toHaveBeenCalledWith(product);
  });

  it("asks the catalog to open the barcode label dialog", () => {
    renderRow();
    openContextMenu();
    fireEvent.click(
      screen.getByRole("menuitem", { name: /Print barcode label/i }),
    );
    expect(onPrintLabel).toHaveBeenCalledWith(product);
  });

  it("asks the catalog to open the delete confirmation", () => {
    renderRow();
    openContextMenu();
    fireEvent.click(screen.getByRole("menuitem", { name: /Delete product/i }));
    expect(onDeleteProduct).toHaveBeenCalledWith(product);
  });

  it("disables rather than hides Delete for a user without delete_products", () => {
    renderRow({ canDeleteProducts: false });
    openContextMenu();
    const item = screen.getByRole("menuitem", { name: /Delete product/i });
    expect(item.getAttribute("aria-disabled")).toBe("true");
    expect(item.getAttribute("title")).toMatch(/permission/i);
    fireEvent.click(item);
    expect(onDeleteProduct).not.toHaveBeenCalled();
  });

  it("disables rather than hides Print for a user without print_product_labels", () => {
    renderRow({ canPrintLabels: false });
    openContextMenu();
    const item = screen.getByRole("menuitem", { name: /Print barcode label/i });
    expect(item.getAttribute("aria-disabled")).toBe("true");
    expect(item.getAttribute("title")).toMatch(/permission/i);
    fireEvent.click(item);
    expect(onPrintLabel).not.toHaveBeenCalled();
  });

  // A `title` tooltip can never fire on a disabled item: the menu sets
  // data-[disabled]:pointer-events-none, so the element receives no hover at
  // all. The reason has to be on screen to be readable.
  it("shows the denial reason inline, not only in a title attribute", () => {
    renderRow({ canPrintLabels: false, canDeleteProducts: false });
    openContextMenu();
    expect(
      within(screen.getByRole("menuitem", { name: /Print barcode label/i })).getByText(
        /Print Product Labels/i,
      ),
    ).toBeTruthy();
    expect(
      within(screen.getByRole("menuitem", { name: /Delete product/i })).getByText(
        /Delete Products/i,
      ),
    ).toBeTruthy();
  });

  it("shows no denial hint when the user does have the permission", () => {
    renderRow();
    openContextMenu();
    expect(
      within(screen.getByRole("menuitem", { name: /Print barcode label/i })).queryByText(
        /permission/i,
      ),
    ).toBeNull();
  });

  it("keeps View details available to a user with no action permissions", () => {
    renderRow({ canPrintLabels: false, canDeleteProducts: false });
    openContextMenu();
    const item = screen.getByRole("menuitem", { name: /View details/i });
    expect(item.getAttribute("aria-disabled")).not.toBe("true");
  });

  it("does not open the details panel on the right-click itself", () => {
    renderRow();
    openContextMenu();
    expect(onSelect).not.toHaveBeenCalled();
  });
});
