import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import { createRef } from "react";
import type { AuditItem } from "@/components/stock-batch/stock-audits";

// jsdom reports zero size for everything, so the real useVirtualizer would
// compute an empty visible range. Stubbed to hand back every row, same shape
// react-virtual returns — matching pos-product-list-memoization.test.tsx.
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

vi.mock("@/lib/context/store-context", () => ({
  useStore: () => ({ storeProfile: { uppercase_display_enabled: 0 } }),
}));

// The counted cost/selling cells are gated on edit_product_cost/
// edit_product_price - see audit-ledger-step-price-permissions.test.tsx.
vi.mock("@/lib/hooks/use-permissions", () => ({
  useHasPermission: () => true,
}));

import { AuditLedgerStep } from "@/components/stock-batch/audit-ledger-step";

function item(overrides: Partial<AuditItem> = {}): AuditItem {
  return {
    id: "i1",
    name: "Panadol",
    sku: "SKU-1",
    category: "Analgesics",
    systemQty: 10,
    countedQty: 10,
    costPrice: 100,
    countedCostPrice: 100,
    sellingPrice: 150,
    countedSellingPrice: 150,
    ...overrides,
  };
}

/**
 * P1: the ledger's rows are now virtualized and absolutely positioned inside
 * their rowgroup. This guards the restructure — every row still renders with
 * its editable cells, the totals footer still sums the visible rows, and the
 * empty state still appears when nothing matches.
 */
describe("AuditLedgerStep virtualized rows", () => {
  const baseProps = {
    totalItems: 3,
    isLoading: false,
    isSyncing: false,
    onUpdateItem: vi.fn(),
    categories: [{ id: "Analgesics", label: "Analgesics", count: 3 }],
    selectedCategory: "__all__",
    setSelectedCategory: vi.fn(),
    search: "",
    setSearch: vi.fn(),
    scrollElementRef: createRef<HTMLDivElement>(),
  };

  it("renders a row per item, each with its three editable cells", () => {
    render(
      <AuditLedgerStep
        {...baseProps}
        items={[
          item({ id: "a", name: "Panadol" }),
          item({ id: "b", name: "Amoxil" }),
          item({ id: "c", name: "Flagyl" }),
        ]}
      />,
    );

    expect(screen.getByText("Panadol")).toBeTruthy();
    expect(screen.getByText("Amoxil")).toBeTruthy();
    expect(screen.getByText("Flagyl")).toBeTruthy();
    // 3 rows x (counted qty, counted cost, counted selling)
    expect(screen.getAllByRole("spinbutton")).toHaveLength(9);
  });

  it("still totals the rows currently shown", () => {
    render(
      <AuditLedgerStep
        {...baseProps}
        items={[item({ id: "a", countedQty: 12 }), item({ id: "b", countedQty: 7 })]}
      />,
    );

    // +2 and -3 against system qty 10 each.
    expect(screen.getByText("-1")).toBeTruthy();
  });

  it("shows the empty state when nothing matches", () => {
    render(<AuditLedgerStep {...baseProps} items={[]} search="zzz" />);
    expect(screen.getByText(/No items match/i)).toBeTruthy();
  });
});
