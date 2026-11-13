import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { StockBatch } from "@/lib/types/stock-batch";

const granted = new Set<string>();

if (!globalThis.ResizeObserver) {
  globalThis.ResizeObserver = class {
    observe() {}
    unobserve() {}
    disconnect() {}
  } as unknown as typeof ResizeObserver;
}

vi.mock("@/lib/hooks/use-permissions", () => ({
  useHasPermission: (key: string) => granted.has(key),
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

vi.mock("@/lib/hooks/use-stock-visibility", () => ({
  useStockVisibility: () => ({ canSeeQuantities: true }),
}));

const batch: StockBatch = {
  id: "batch-1",
  product_id: "p1",
  batch_number: "LOT-7",
  quantity: 0,
  cost_price: 1200,
  expiry_date: "2020-01-01",
  is_active: 1,
};

vi.mock("@/components/products/product-details/use-product-details", () => ({
  useProductDetails: () => ({
    batches: [batch],
    loadingBatches: false,
    creator: null,
    formatPrice: (n: number) => `₦${n.toLocaleString()}`,
    formatDate: (d: string) => d,
    expiryWarningDays: 90,
    profitMargin: 0,
    daysToExpiry: null,
  }),
}));

vi.mock("@/components/products/product-details/product-history", () => ({
  ProductHistory: () => null,
}));

import { CatalogDetailPanel } from "@/components/products/catalog-detail-panel";
import type { Product } from "@/components/products/types";

const product = {
  id: "p1-aaaaaaaa",
  name: "Amoxil 500mg",
  category: "Antibiotics",
  sellingPrice: 1500,
  costPrice: 1200,
  stockQuantity: 0,
} as unknown as Product;

function openBatchesTab() {
  render(
    <QueryClientProvider client={new QueryClient()}>
      <CatalogDetailPanel product={product} onEditProduct={vi.fn()} />
    </QueryClientProvider>,
  );
  fireEvent.mouseDown(screen.getByRole("tab", { name: "Batches" }));
}

const editButton = () => screen.queryByRole("button", { name: "Edit cost price for batch LOT-7" });
const getEditButton = () => screen.getByRole("button", { name: "Edit cost price for batch LOT-7" });

describe("Catalog batches tab cost editing", () => {
  beforeEach(() => granted.clear());

  it("lets a user who may edit and view cost correct even an expired, empty batch", () => {
    granted.add("edit_product_cost").add("view_cost_fields");
    openBatchesTab();

    fireEvent.click(getEditButton());

    expect(screen.getByLabelText(/new cost price/i)).toBeTruthy();
  });

  it("offers no edit control without edit_product_cost", () => {
    granted.add("view_cost_fields");
    openBatchesTab();

    expect(screen.getByText(/Cost: ₦1,200/)).toBeTruthy();
    expect(editButton()).toBeNull();
  });

  it("hides the batch cost and the edit control from a user who may not view cost", () => {
    granted.add("edit_product_cost");
    openBatchesTab();

    expect(screen.getByText("Batch #LOT-7")).toBeTruthy();
    expect(screen.queryByText(/₦1,200/)).toBeNull();
    expect(screen.queryByText("Cost Price")).toBeNull();
    expect(editButton()).toBeNull();
  });
});
