import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";
import { createRef } from "react";
import type { AuditItem } from "@/components/stock-batch/stock-audits";

/**
 * The cycle count is the app's only surface where a product's cost price
 * and selling price can each be corrected as master data, so it is where
 * "edit_product_cost" and "edit_product_price" split apart from the coarse
 * manage_products right. Performing the count itself stays
 * "perform_stock_audit": a counter without the price keys still enters
 * counted quantities, and still SEES both counted figures - they just fall
 * back to a read-only value instead of an input.
 */

const hasPermission = vi.fn((_key: string) => true);

vi.mock("@/lib/hooks/use-permissions", () => ({
  useHasPermission: (key: string) => hasPermission(key),
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

import { AuditLedgerStep } from "@/components/stock-batch/audit-ledger-step";

const item: AuditItem = {
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
} as AuditItem;

function renderLedger() {
  render(
    <AuditLedgerStep
      items={[item]}
      totalItems={1}
      isLoading={false}
      isSyncing={false}
      onUpdateItem={vi.fn()}
      categories={[{ id: "Analgesics", label: "Analgesics", count: 1 }]}
      selectedCategory="__all__"
      setSelectedCategory={vi.fn()}
      search=""
      setSearch={vi.fn()}
      scrollElementRef={createRef<HTMLDivElement>()}
    />,
  );
}

describe("Audit ledger cost/price edit permissions", () => {
  beforeEach(() => {
    hasPermission.mockReset();
    hasPermission.mockImplementation(() => true);
  });

  it("checks both product price keys", () => {
    renderLedger();
    expect(hasPermission).toHaveBeenCalledWith("edit_product_cost");
    expect(hasPermission).toHaveBeenCalledWith("edit_product_price");
  });

  it("offers counted quantity, cost and selling inputs with both keys", () => {
    renderLedger();
    expect(screen.getAllByRole("spinbutton")).toHaveLength(3);
  });

  it("drops only the counted-cost input without edit_product_cost", () => {
    hasPermission.mockImplementation(
      (key: string) => key !== "edit_product_cost",
    );
    renderLedger();
    expect(screen.getAllByRole("spinbutton")).toHaveLength(2);
  });

  it("drops only the counted-selling input without edit_product_price", () => {
    hasPermission.mockImplementation(
      (key: string) => key !== "edit_product_price",
    );
    renderLedger();
    expect(screen.getAllByRole("spinbutton")).toHaveLength(2);
  });

  it("leaves only the counted-quantity input when neither price key is held", () => {
    hasPermission.mockImplementation(
      (key: string) =>
        key !== "edit_product_cost" && key !== "edit_product_price",
    );
    renderLedger();
    expect(screen.getAllByRole("spinbutton")).toHaveLength(1);
  });
});
