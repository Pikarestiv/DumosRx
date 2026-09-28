import { describe, it, expect, vi, beforeEach } from "vitest";
import { render } from "@testing-library/react";
import React from "react";
import type { Product } from "@/components/products/types";
import type { CatalogRowProps } from "@/components/products/catalog-row";

/**
 * CatalogRow is React.memo'd, but every save handler CatalogList passed it was
 * a fresh function on every render, so the memo never bailed out and all ~20
 * visible rows (each with four stateful editable cells) re-rendered on any
 * parent render. Two causes:
 *
 *  - the useCallbacks depended on the whole `useMutation` result, which
 *    react-query rebuilds as a new object literal on every render
 *    (`return { ...result, mutate, mutateAsync: result.mutate }`); only
 *    `.mutateAsync` is stable, being bound once per observer.
 *  - `onProductUpdated` arrived from product-database as an inline
 *    `() => void refetch()`.
 *
 * Render-count assertions are brittle (see pos-product-list-memoization), so
 * this pins the actual mechanism instead: the handler props CatalogRow receives
 * must keep their identity across a parent rerender that changes nothing
 * relevant.
 */

const capturedProps: CatalogRowProps[] = [];

vi.mock("@/components/products/catalog-row", () => ({
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

// Mirrors react-query's real contract: a brand-new result object per render,
// with a stable mutateAsync. A fix that depends on the whole object therefore
// still breaks here, exactly as it does in the app.
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

const HANDLER_KEYS = [
  "onSaveCategory",
  "onSaveSellingPrice",
  "onSaveStockQuantity",
  "onSaveReorderLevel",
] as const;

describe("CatalogList row callback identity", () => {
  beforeEach(() => {
    capturedProps.length = 0;
  });

  it("keeps every CatalogRow save handler stable across a parent rerender", () => {
    // Stable, the way product-database must now pass it.
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

    const { rerender } = render(<CatalogList {...props} />);
    expect(capturedProps.length).toBeGreaterThan(0);
    const first = capturedProps[capturedProps.length - 1];

    rerender(<CatalogList {...props} selectedProductId={undefined} />);
    const second = capturedProps[capturedProps.length - 1];

    for (const key of HANDLER_KEYS) {
      expect(second[key], `${key} lost its identity across a rerender`).toBe(first[key]);
    }
  });

  it("still routes each handler to the right mutation", async () => {
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
        onProductUpdated={vi.fn()}
      />,
    );

    const row = capturedProps[capturedProps.length - 1];
    await row.onSaveSellingPrice(products[0], 250);
    expect(quickEditMutateAsync).toHaveBeenCalledWith({ id: "p1", sellingPrice: 250 });

    await row.onSaveStockQuantity(products[0], 7);
    expect(stockAuditMutateAsync).toHaveBeenCalledWith(
      expect.objectContaining({
        items: [expect.objectContaining({ productId: "p1", countedQty: 7 })],
      }),
    );
  });
});
