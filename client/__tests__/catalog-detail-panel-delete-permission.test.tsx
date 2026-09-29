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
  ProductDeleteDialog: ({ target }: { target: unknown }) =>
    target ? <div data-testid="delete-dialog" /> : null,
}));

vi.mock("@/components/stock-batch/barcode-print-dialog", () => ({
  BarcodePrintDialog: () => null,
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
  stockQuantity: 0,
} as unknown as Product;

function openMenu() {
  fireEvent.pointerDown(
    screen.getByRole("button", { name: /product actions/i }),
    new MouseEvent("pointerdown", { bubbles: true }),
  );
}

describe("Catalog detail panel delete-product permission", () => {
  beforeEach(() => {
    hasPermission.mockReset();
    hasPermission.mockImplementation(() => true);
  });

  it("offers Delete Product to a user with delete_products", () => {
    render(<CatalogDetailPanel product={product} onEditProduct={vi.fn()} />);
    openMenu();
    expect(screen.getByRole("menuitem", { name: /Delete Product/ })).toBeTruthy();
  });

  it("hides Delete Product from a user without delete_products", () => {
    hasPermission.mockImplementation((key: string) => key !== "delete_products");
    render(<CatalogDetailPanel product={product} onEditProduct={vi.fn()} />);
    openMenu();
    expect(screen.queryByRole("menuitem", { name: /Delete Product/ })).toBeNull();
  });

  it("keeps Edit Product available without delete_products", () => {
    hasPermission.mockImplementation((key: string) => key !== "delete_products");
    render(<CatalogDetailPanel product={product} onEditProduct={vi.fn()} />);
    openMenu();
    expect(screen.getByRole("menuitem", { name: /Edit Product/ })).toBeTruthy();
  });

  it("still opens a menu for a user whose only right is delete_products", () => {
    hasPermission.mockImplementation((key: string) => key === "delete_products");
    render(<CatalogDetailPanel product={product} onEditProduct={vi.fn()} />);
    expect(screen.getByRole("button", { name: /product actions/i })).toBeTruthy();
  });

  it("checks the delete_products key specifically", () => {
    render(<CatalogDetailPanel product={product} onEditProduct={vi.fn()} />);
    expect(hasPermission).toHaveBeenCalledWith("delete_products");
  });

  it("opens the confirmation dialog rather than deleting straight from the menu", () => {
    render(<CatalogDetailPanel product={product} onEditProduct={vi.fn()} />);
    expect(screen.queryByTestId("delete-dialog")).toBeNull();
    openMenu();
    fireEvent.click(screen.getByRole("menuitem", { name: /Delete Product/ }));
    expect(screen.getByTestId("delete-dialog")).toBeTruthy();
  });
});
