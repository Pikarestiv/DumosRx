import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";
import { createRef } from "react";
import type { AuditItem } from "@/components/stock-batch/stock-audits";
import { AuditLedgerStep } from "@/components/stock-batch/audit-ledger-step";
import { AuditReviewStep } from "@/components/stock-batch/audit-review-step";

const granted = new Set<string>();

vi.mock("@/lib/hooks/use-permissions", () => ({
  useHasPermission: (key: string) => granted.has(key),
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

vi.mock("@/lib/context/store-context", () => ({
  useStore: () => ({ storeProfile: { uppercase_display_enabled: 0 } }),
}));

const sampleItem: AuditItem = {
  id: "item-1",
  name: "Amoxicillin 500mg",
  sku: "AMOX-500",
  category: "Antibiotics",
  systemQty: 20,
  countedQty: 25,
  costPrice: 850,
  countedCostPrice: 900,
  sellingPrice: 1200,
  countedSellingPrice: 1200,
  lastAuditedAt: "2026-11-10 14:00:00",
} as AuditItem;

function renderLedger(items: AuditItem[] = [sampleItem]) {
  return render(
    <AuditLedgerStep
      items={items}
      totalItems={items.length}
      isLoading={false}
      presync={{ state: "ready", error: null, notice: null, retry: vi.fn(), countAnyway: vi.fn() }}
      onUpdateItem={vi.fn()}
      onCountRow={vi.fn()}
      onClearCount={vi.fn()}
      categories={[{ id: "Antibiotics", label: "Antibiotics", count: 1 }]}
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
}

describe("Audit ledger cost visibility (A-381)", () => {
  beforeEach(() => {
    granted.clear();
  });

  it("hides Cost Price, Counted Cost and Diff Cost headers and cells when view_cost_fields is withheld", () => {
    granted.add("perform_stock_audit");
    renderLedger();

    expect(screen.queryByText("Cost Price")).toBeNull();
    expect(screen.queryByText("Counted Cost")).toBeNull();
    expect(screen.queryByText("Diff Cost")).toBeNull();

    expect(screen.getByText("Counted Qty")).toBeTruthy();
    expect(screen.getByText("System Qty")).toBeTruthy();
    expect(screen.getByText("Diff Qty")).toBeTruthy();
    expect(screen.getByText("Selling Price")).toBeTruthy();
    expect(screen.getByText("Counted Selling")).toBeTruthy();
    expect(screen.getByText("Diff Selling")).toBeTruthy();

    expect(document.body.textContent).not.toMatch(/850|900/);
  });

  it("shows Cost Price, Counted Cost, Diff Cost and totals when view_cost_fields is granted", () => {
    granted.add("perform_stock_audit");
    granted.add("view_cost_fields");
    renderLedger();

    expect(screen.getByText("Cost Price")).toBeTruthy();
    expect(screen.getByText("Counted Cost")).toBeTruthy();
    expect(screen.getByText("Diff Cost")).toBeTruthy();

    expect(screen.getByText(/850/)).toBeTruthy();
  });

  it("adjusts empty state column span when view_cost_fields is withheld", () => {
    renderLedger([]);
    const emptyCell = document.querySelector(".col-span-8");
    expect(emptyCell).toBeTruthy();
  });

  it("adjusts empty state column span when view_cost_fields is granted", () => {
    granted.add("view_cost_fields");
    renderLedger([]);
    const emptyCell = document.querySelector(".col-span-11");
    expect(emptyCell).toBeTruthy();
  });

  describe("AuditReviewStep cost adjustments", () => {
    it("hides cost amounts and shows generic notice in review step when view_cost_fields is withheld", () => {
      const adjustedItem: AuditItem = {
        ...sampleItem,
        costPrice: 800,
        countedCostPrice: 950,
      };

      const mockFreshness = {
        localMinutes: 0,
        isLocalStale: false,
        stalePeers: [],
        thresholdMinutes: 60,
        deficits: [],
        owed: [],
        shouldWarn: false,
      };

      render(
        <AuditReviewStep
          countedItems={[adjustedItem]}
          adjustedItems={[adjustedItem]}
          freshness={mockFreshness}
          staleAcknowledged={false}
          onStaleAcknowledgedChange={vi.fn()}
        />,
      );

      expect(screen.getByText("Cost price adjusted")).toBeTruthy();
      expect(document.body.textContent).not.toMatch(/800|950/);
    });

    it("shows cost amounts in review step when view_cost_fields is granted", () => {
      granted.add("view_cost_fields");
      const adjustedItem: AuditItem = {
        ...sampleItem,
        costPrice: 800,
        countedCostPrice: 950,
      };

      const mockFreshness = {
        localMinutes: 0,
        isLocalStale: false,
        stalePeers: [],
        thresholdMinutes: 60,
        deficits: [],
        owed: [],
        shouldWarn: false,
      };

      render(
        <AuditReviewStep
          countedItems={[adjustedItem]}
          adjustedItems={[adjustedItem]}
          freshness={mockFreshness}
          staleAcknowledged={false}
          onStaleAcknowledgedChange={vi.fn()}
        />,
      );

      expect(screen.getByText(/Cost:.*800.*950/)).toBeTruthy();
    });
  });
});
