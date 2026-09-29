import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";
import React from "react";
import type { Product } from "@/components/products/types";
import type { CatalogRowProps } from "@/components/products/catalog-row";

/**
 * The product catalog is where three Inventory & Stock keys land:
 * "view_cost_fields" decides whether the Avg Cost column exists at all
 * (it was visible to every role, cashiers included, before this),
 * "edit_product_price" fronts the selling-price quick edit and
 * "adjust_stock_counts" fronts the stock-quantity quick edit - both split
 * out of the coarse manage_products/canManageStockBatch check that still
 * gates category and reorder level. Without a key the figure stays on
 * screen read-only; only the pencil goes.
 */

const hasPermission = vi.fn((_key: string) => true);

vi.mock("@/lib/hooks/use-permissions", () => ({
  useHasPermission: (key: string) => hasPermission(key),
}));

const capturedProps: CatalogRowProps[] = [];

vi.mock("@/components/products/catalog-row", async (importOriginal) => {
  const actual =
    await importOriginal<typeof import("@/components/products/catalog-row")>();
  return {
    ...actual,
    CatalogRow: (props: CatalogRowProps) => {
      capturedProps.push(props);
      return <div data-testid="catalog-row">{props.product.name}</div>;
    },
  };
});

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

vi.mock("@/lib/hooks/use-product-quick-edit-mutation", () => ({
  useQuickEditProductMutation: () => ({
    mutateAsync: vi.fn(),
    isPending: false,
  }),
}));
vi.mock("@/lib/hooks/use-stock-audit-mutation", () => ({
  useSubmitStockAuditMutation: () => ({
    mutateAsync: vi.fn(),
    isPending: false,
  }),
}));

vi.mock("@tanstack/react-query", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@tanstack/react-query")>()),
  useQuery: () => ({ data: [{ name: "Painkillers" }] }),
}));

vi.mock("@/lib/context/store-context", () => ({
  useStore: () => ({
    storeType: "pharmacy",
    storeProfile: { uppercase_display_enabled: 1 },
  }),
}));
vi.mock("@/lib/context/auth-context", () => ({
  useAuth: () => ({
    canManageStockBatch: true,
    isAdmin: true,
    user: { id: "u1" },
  }),
}));
vi.mock("@/lib/hooks/use-has-touch-capability", () => ({
  useHasTouchCapability: () => false,
}));
vi.mock("@/hooks/use-media-query", () => ({ useMediaQuery: () => true }));
vi.mock("@/lib/hooks/use-uppercase-display", () => ({
  useUppercaseDisplayClass: () => "capitalize",
  useUppercaseDisplay: () => false,
  capitalizeWords: (s: string) => s,
}));
vi.mock("@/components/pos/request-item-dialog", () => ({
  RequestItemDialog: () => null,
}));

vi.mock("@/components/products/product-delete-dialog", () => ({
  ProductDeleteDialog: () => null,
}));

vi.mock("@/components/stock-batch/barcode-print-dialog", () => ({
  BarcodePrintDialog: () => null,
}));

import { CatalogList } from "@/components/products/catalog-list";

const products: Product[] = [
  {
    id: "p1",
    name: "Panadol",
    category: "Painkillers",
    costPrice: 50,
    sellingPrice: 100,
    stockQuantity: 12,
    reorderLevel: 5,
    baseUnit: "unit",
  } as Product,
];

function renderList() {
  render(
    <CatalogList
      filteredProducts={products}
      totalCount={1}
      isFuzzyFallback={false}
      formatCurrency={(n: number) => `N${n}`}
      onSelectProduct={vi.fn()}
      sortKey={null}
      sortDirection="asc"
      onToggleSort={vi.fn()}
      onProductUpdated={vi.fn()}
    />,
  );
  return capturedProps[capturedProps.length - 1];
}

function withoutKey(denied: string) {
  hasPermission.mockImplementation((key: string) => key !== denied);
}

describe("Catalog list inventory permissions", () => {
  beforeEach(() => {
    capturedProps.length = 0;
    hasPermission.mockReset();
    hasPermission.mockImplementation(() => true);
  });

  it("reads all three catalog keys", () => {
    renderList();
    expect(hasPermission).toHaveBeenCalledWith("view_cost_fields");
    expect(hasPermission).toHaveBeenCalledWith("edit_product_price");
    expect(hasPermission).toHaveBeenCalledWith("adjust_stock_counts");
  });

  it("shows the Avg Cost column with view_cost_fields", () => {
    const props = renderList();
    expect(props.showCostColumn).toBe(true);
    expect(screen.queryByText("Avg Cost")).not.toBeNull();
  });

  it("drops the Avg Cost column without view_cost_fields", () => {
    withoutKey("view_cost_fields");
    const props = renderList();
    expect(props.showCostColumn).toBe(false);
    expect(screen.queryByText("Avg Cost")).toBeNull();
  });

  it("withholds the selling-price quick edit without edit_product_price", () => {
    withoutKey("edit_product_price");
    const props = renderList();
    expect(props.canEditSellingPrice).toBe(false);
    expect(props.canAdjustStockQuantity).toBe(true);
  });

  it("withholds the stock-quantity quick edit without adjust_stock_counts", () => {
    withoutKey("adjust_stock_counts");
    const props = renderList();
    expect(props.canAdjustStockQuantity).toBe(false);
    expect(props.canEditSellingPrice).toBe(true);
  });
});
