import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import React from "react";

if (!globalThis.ResizeObserver) {
  globalThis.ResizeObserver = class {
    observe() {}
    unobserve() {}
    disconnect() {}
  } as unknown as typeof ResizeObserver;
}

if (!window.matchMedia) {
  window.matchMedia = ((query: string) => ({
    matches: true,
    media: query,
    onchange: null,
    addEventListener: () => {},
    removeEventListener: () => {},
    addListener: () => {},
    removeListener: () => {},
    dispatchEvent: () => false,
  })) as unknown as typeof window.matchMedia;
}

const PRODUCT = {
  id: "p1-aaaaaaaa",
  name: "Paracetamol 500mg",
  category: "Analgesics",
  barcode: "5901234123457",
  cost_price: 800,
  selling_price: 1500,
  stock_quantity: 0,
  reorder_level: 5,
  base_unit: "pack",
};

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn(), replace: vi.fn(), prefetch: vi.fn() }),
  useSearchParams: () => new URLSearchParams(),
}));

vi.mock("@/lib/context/store-context", () => ({
  useStore: () => ({ storeType: "pharmacy", storeProfile: { currency: "NGN" } }),
}));

vi.mock("@/lib/context/auth-context", () => ({
  useAuth: () => ({ canManageStockBatch: true, isAdmin: true, user: { id: "u1" } }),
}));

vi.mock("@/lib/hooks/use-permissions", () => ({
  useHasPermission: () => true,
}));

vi.mock("@/lib/hooks/use-uppercase-display", () => ({
  useUppercaseDisplayClass: () => "",
  useUppercaseDisplay: () => false,
}));

vi.mock("@/hooks/use-media-query", () => ({ useMediaQuery: () => true }));

vi.mock("@/lib/db/queries/products", () => ({
  getProductsWithDetails: vi.fn(() => Promise.resolve([PRODUCT])),
  getProductList: vi.fn(() => Promise.resolve([PRODUCT])),
}));
vi.mock("@/lib/db/queries/categories", () => ({
  getCategoryList: vi.fn(() => Promise.resolve([{ name: "Analgesics" }])),
}));
vi.mock("@/lib/hooks/use-outstanding-backorders", () => ({
  useOutstandingBackorders: () => [],
}));

const deleteMutateAsync = vi.fn(async () => {});
vi.mock("@/lib/hooks/use-product-delete", () => ({
  useDeleteProductMutation: () => ({ mutateAsync: deleteMutateAsync }),
  useProductDeletionBlockers: () => ({
    blockers: { stockOnHand: 0, openPurchaseOrders: 0 },
    isLoading: false,
  }),
}));

vi.mock("@/components/products/use-add-product", () => ({
  useAddProduct: () => ({ handleAddProduct: vi.fn(), isSaving: false }),
}));

vi.mock("@/components/products/add-product-dialog", () => ({
  AddProductDialog: ({ open, editingProduct }: { open: boolean; editingProduct?: { name: string } | null }) =>
    open ? <div data-testid="edit-product-dialog">{editingProduct?.name ?? "new product"}</div> : null,
}));

vi.mock("@/components/products/product-database-filters", () => ({
  ProductDatabaseFilters: () => null,
}));

vi.mock("@/components/products/catalog-detail-panel", () => ({
  CatalogDetailPanel: ({ product }: { product: { name: string } | null }) =>
    product ? <div data-testid="detail-panel">{product.name}</div> : null,
}));

vi.mock("@/components/ui/responsive-detail-panel", () => ({
  ResponsiveDetailPanel: ({
    open,
    children,
  }: {
    open: boolean;
    children: React.ReactNode;
  }) => (open ? <div>{children}</div> : null),
}));

vi.mock("@tanstack/react-virtual", () => ({
  useVirtualizer: ({
    count,
    estimateSize,
  }: {
    count: number;
    estimateSize: () => number;
  }) => ({
    getVirtualItems: () =>
      Array.from({ length: count }, (_, index) => ({
        key: index,
        index,
        start: index * estimateSize(),
        size: estimateSize(),
      })),
    getTotalSize: () => count * estimateSize(),
    measureElement: () => {},
  }),
}));

import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { ProductDatabase } from "@/components/products/product-database";

function renderCatalog() {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  return render(
    <QueryClientProvider client={queryClient}>
      <ProductDatabase />
    </QueryClientProvider>,
  );
}

describe("the row's edit pencil", () => {
  it("opens the edit dialog for that product without opening its side panel", async () => {
    renderCatalog();

    fireEvent.click(await screen.findByRole("button", { name: "Edit Paracetamol 500mg" }));

    expect((await screen.findByTestId("edit-product-dialog")).textContent).toBe("Paracetamol 500mg");
    expect(screen.queryByTestId("detail-panel")).toBeNull();
  });
});
