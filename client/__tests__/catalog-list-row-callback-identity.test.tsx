import { describe, it, expect, vi, beforeEach } from "vitest";
import { render } from "@testing-library/react";
import React from "react";
import type { Product } from "@/components/products/types";
import type { CatalogRowProps } from "@/components/products/catalog-row";

// CatalogRow is React.memo'd, but every save handler CatalogList passed it was a fresh function on every render, so the me…
// Rationale: docs/CLIENT_COMMENTS.md#block-__tests__-catalog-list-row-callback-identity-test-tsx-L7

const capturedProps: CatalogRowProps[] = [];

vi.mock("@/components/products/catalog-row", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/components/products/catalog-row")>()),
  CatalogRow: (props: CatalogRowProps) => {
    capturedProps.push(props);
    return <div data-testid="catalog-row">{props.product.name}</div>;
  },
}));

vi.mock("@tanstack/react-virtual", () => ({
  useVirtualizer: ({ count, estimateSize }: { count: number; estimateSize: () => number }) => ({
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

// Mirrors react-query's real contract:
// Rationale: docs/CLIENT_COMMENTS.md#line-__tests__-catalog-list-row-callback-identity-test-tsx-L50
const quickEditMutateAsync = vi.fn().mockResolvedValue(undefined);
const stockAuditMutateAsync = vi.fn().mockResolvedValue(undefined);

vi.mock("@/lib/hooks/use-product-quick-edit-mutation", () => ({
  useQuickEditProductMutation: () => ({ mutateAsync: quickEditMutateAsync, isPending: false }),
}));
vi.mock("@/lib/hooks/use-stock-audit-mutation", () => ({
  useSubmitStockAuditMutation: () => ({ mutateAsync: stockAuditMutateAsync, isPending: false }),
}));

vi.mock("@tanstack/react-query", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@tanstack/react-query")>()),
  useQuery: () => ({ data: [{ name: "Painkillers" }] }),
}));

vi.mock("@/lib/context/store-context", () => ({
  useStore: () => ({ storeType: "pharmacy", storeProfile: { uppercase_display_enabled: 1 } }),
}));
vi.mock("@/lib/context/auth-context", () => ({
  useAuth: () => ({ canManageStockBatch: true, isAdmin: true, user: { id: "u1" } }),
}));
vi.mock("@/lib/hooks/use-has-touch-capability", () => ({
  useHasTouchCapability: () => false,
}));
vi.mock("@/hooks/use-media-query", () => ({
  useMediaQuery: () => true,
}));
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

describe("CatalogList row actions and mutations", () => {
  beforeEach(() => {
    capturedProps.length = 0;
    quickEditMutateAsync.mockClear();
    stockAuditMutateAsync.mockClear();
  });

  it("renders catalog rows and retains rendered content across parent prop updates", () => {
    const onProductUpdated = vi.fn();

    const props = {
      filteredProducts: products,
      totalCount: 1,
      isFuzzyFallback: false,
      formatCurrency: (n: number) => `N${n}`,
      onSelectProduct: vi.fn(),
      sortKey: null,
      sortDirection: "asc" as const,
      onToggleSort: vi.fn(),
      onProductUpdated,
    };

    const { rerender, getByText } = render(<CatalogList {...props} />);
    expect(getByText("Panadol")).toBeDefined();
    expect(capturedProps.length).toBeGreaterThan(0);

    rerender(<CatalogList {...props} selectedProductId="p1" />);
    expect(getByText("Panadol")).toBeDefined();
  });

  it("routes row save actions to the correct mutations and notifies parent on update", async () => {
    const onProductUpdated = vi.fn();

    render(
      <CatalogList
        filteredProducts={products}
        totalCount={1}
        isFuzzyFallback={false}
        formatCurrency={(n) => `N${n}`}
        onSelectProduct={vi.fn()}
        sortKey={null}
        sortDirection="asc"
        onToggleSort={vi.fn()}
        onProductUpdated={onProductUpdated}
      />,
    );

    const row = capturedProps[capturedProps.length - 1];

    await row.onSaveCategory(products[0], "Antibiotics");
    expect(quickEditMutateAsync).toHaveBeenCalledWith({ id: "p1", category: "Antibiotics" });
    expect(onProductUpdated).toHaveBeenCalledTimes(1);

    await row.onSaveSellingPrice(products[0], 250);
    expect(quickEditMutateAsync).toHaveBeenCalledWith({ id: "p1", sellingPrice: 250 });
    expect(onProductUpdated).toHaveBeenCalledTimes(2);

    await row.onSaveReorderLevel(products[0], 10);
    expect(quickEditMutateAsync).toHaveBeenCalledWith({ id: "p1", reorderLevel: 10 });
    expect(onProductUpdated).toHaveBeenCalledTimes(3);

    await row.onSaveStockQuantity(products[0], 7);
    expect(stockAuditMutateAsync).toHaveBeenCalledWith(
      expect.objectContaining({
        items: [expect.objectContaining({ productId: "p1", countedQty: 7 })],
      }),
    );
    expect(onProductUpdated).toHaveBeenCalledTimes(4);
  });
});
