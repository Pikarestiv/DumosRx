import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { createRef } from "react";
import type { AuditItem } from "@/components/stock-batch/stock-audits";

const mediaState = { isDesktop: false };

vi.mock("@/hooks/use-media-query", () => ({
  useMediaQuery: () => mediaState.isDesktop,
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

vi.mock("@/lib/context/store-context", () => ({
  useStore: () => ({ storeProfile: { uppercase_display_enabled: 0 } }),
}));

vi.mock("@/lib/hooks/use-permissions", () => ({
  useHasPermission: () => true,
}));

import { AuditLedgerStep } from "@/components/stock-batch/audit-ledger-step";

const sampleItem: AuditItem = {
  id: "a1",
  name: "Paracetamol 500mg",
  sku: "PARA-500",
  category: "Analgesics",
  systemQty: 20,
  countedQty: 18,
  costPrice: 100,
  countedCostPrice: 100,
  sellingPrice: 150,
  countedSellingPrice: 150,
};

describe("AuditLedgerStep responsive layout", () => {
  const onCountRow = vi.fn();

  beforeEach(() => {
    mediaState.isDesktop = false;
    onCountRow.mockClear();
  });

  it("renders Cycle Count cards on mobile (< 1024px) instead of a wide horizontal table", () => {
    render(
      <AuditLedgerStep
        items={[sampleItem]}
        totalItems={1}
        isLoading={false}
        presync={{ state: "ready", error: null, notice: null, retry: vi.fn(), countAnyway: vi.fn() }}
        onUpdateItem={vi.fn()}
        onCountRow={onCountRow}
        onClearCount={vi.fn()}
        categories={[{ id: "Analgesics", label: "Analgesics", count: 1 }]}
        selectedCategory="__all__"
        setSelectedCategory={vi.fn()}
        countStatus="all"
        setCountStatus={vi.fn()}
        countedCount={1}
        search=""
        setSearch={vi.fn()}
        scrollElementRef={createRef<HTMLDivElement>()}
        sort={{ sortKey: null, direction: "asc", toggleSort: vi.fn() }}
      />,
    );

    expect(screen.queryByRole("table")).toBeNull();
    expect(screen.getByLabelText("Sort audit items")).toBeTruthy();
    expect(screen.getByText("Paracetamol 500mg")).toBeTruthy();
    expect(screen.getByText("Net Diff Qty")).toBeTruthy();

    fireEvent.click(screen.getByLabelText("Mark Paracetamol 500mg as counted"));
  });

  it("renders the desktop table at >= 1024px", () => {
    mediaState.isDesktop = true;
    render(
      <AuditLedgerStep
        items={[sampleItem]}
        totalItems={1}
        isLoading={false}
        presync={{ state: "ready", error: null, notice: null, retry: vi.fn(), countAnyway: vi.fn() }}
        onUpdateItem={vi.fn()}
        onCountRow={onCountRow}
        onClearCount={vi.fn()}
        categories={[{ id: "Analgesics", label: "Analgesics", count: 1 }]}
        selectedCategory="__all__"
        setSelectedCategory={vi.fn()}
        countStatus="all"
        setCountStatus={vi.fn()}
        countedCount={1}
        search=""
        setSearch={vi.fn()}
        scrollElementRef={createRef<HTMLDivElement>()}
        sort={{ sortKey: null, direction: "asc", toggleSort: vi.fn() }}
      />,
    );

    expect(
      screen.getByRole("table", { name: "Physical inventory count" }),
    ).toBeTruthy();
  });
});
