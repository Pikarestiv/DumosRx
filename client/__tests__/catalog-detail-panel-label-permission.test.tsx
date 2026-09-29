import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";

const hasPermission = vi.fn((_key: string) => true);

if (!globalThis.ResizeObserver) {
  globalThis.ResizeObserver = class {
    observe() {}
    unobserve() {}
    disconnect() {}
  } as unknown as typeof ResizeObserver;
}

vi.mock("@/lib/hooks/use-permissions", () => ({
  useHasPermission: (key: string) => hasPermission(key),
}));

vi.mock("@/lib/context/auth-context", () => ({
  useAuth: () => ({ canManageStockBatch: true }),
}));

vi.mock("@/lib/context/store-context", () => ({
  useStore: () => ({ storeProfile: { currency: "NGN", store_type: "pharmacy" } }),
}));

vi.mock("@/lib/hooks/use-uppercase-display", () => ({
  useUppercaseDisplayClass: () => "",
}));

vi.mock("@/components/products/product-delete-dialog", () => ({
  ProductDeleteDialog: () => null,
}));

vi.mock("@/components/products/product-details/use-product-details", () => ({
  useProductDetails: () => ({
    batches: [],
    loadingBatches: false,
    creator: null,
    formatPrice: (n: number) => String(n),
    formatDate: (d: string) => d,
    expiryWarningDays: 90,
    profitMargin: 0,
    daysToExpiry: null,
  }),
}));

vi.mock("@/components/products/product-details/product-basic-info", () => ({
  ProductBasicInfo: () => null,
}));
vi.mock("@/components/products/product-details/product-supplier-info", () => ({
  ProductSupplierInfo: () => null,
}));
vi.mock("@/components/products/product-details/product-pricing-info", () => ({
  ProductPricingInfo: () => null,
}));
vi.mock("@/components/products/product-details/product-stock-info", () => ({
  ProductStockInfo: () => null,
}));
vi.mock("@/components/products/product-details/product-batch-history", () => ({
  ProductBatchHistory: () => null,
}));
vi.mock("@/components/products/product-details/product-history", () => ({
  ProductHistory: () => null,
}));

import { CatalogDetailPanel } from "@/components/products/catalog-detail-panel";
import type { Product } from "@/components/products/types";

const product = {
  id: "p1-aaaaaaaa",
  name: "Paracetamol 500mg",
  category: "Analgesics",
  barcode: "5901234123457",
  sellingPrice: 1500,
} as unknown as Product;

function renderPanel() {
  render(
    <CatalogDetailPanel product={product} onEditProduct={vi.fn()} />,
  );
  fireEvent.pointerDown(
    screen.getByRole("button", { name: /product actions/i }),
    new MouseEvent("pointerdown", { bubbles: true }),
  );
}

/**
 * barcode-print-dialog.tsx has always been real and tested, but its only
 * mount was keyed off a stock-overview.tsx state whose setter was never
 * called — the feature existed with no way to open it. The catalog detail
 * panel's overflow menu is the trigger, and print_product_labels gates it.
 */
describe("Catalog detail panel label-print permission", () => {
  beforeEach(() => {
    hasPermission.mockReset();
    hasPermission.mockImplementation(() => true);
  });

  it("offers Print Labels to a user with print_product_labels", () => {
    renderPanel();
    expect(screen.getByRole("menuitem", { name: /Print Labels/ })).toBeTruthy();
  });

  it("hides Print Labels from a user without print_product_labels", () => {
    hasPermission.mockImplementation(
      (key: string) => key !== "print_product_labels",
    );
    renderPanel();
    expect(screen.queryByRole("menuitem", { name: /Print Labels/ })).toBeNull();
  });

  it("keeps Edit Product available without print_product_labels", () => {
    hasPermission.mockImplementation(
      (key: string) => key !== "print_product_labels",
    );
    renderPanel();
    expect(screen.getByRole("menuitem", { name: /Edit Product/ })).toBeTruthy();
  });

  it("checks the print_product_labels key specifically", () => {
    render(<CatalogDetailPanel product={product} onEditProduct={vi.fn()} />);
    expect(hasPermission).toHaveBeenCalledWith("print_product_labels");
  });
});
