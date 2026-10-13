import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, act, cleanup, fireEvent } from "@testing-library/react";
import { createRef } from "react";
import type { AuditItem } from "@/components/stock-batch/stock-audits";
import { AuditLedgerStep } from "@/components/stock-batch/audit-ledger-step";

vi.mock("@/lib/hooks/use-permissions", () => ({
  useHasPermission: () => true,
}));

vi.mock("@/lib/context/store-context", () => ({
  useStore: () => ({ storeProfile: { uppercase_display_enabled: 0 } }),
}));

vi.mock("@tanstack/react-virtual", () => ({
  useVirtualizer: ({ count }: { count: number }) => ({
    getTotalSize: () => count * 49,
    getVirtualItems: () =>
      Array.from({ length: count }, (_, index) => ({
        index,
        key: index,
        start: index * 49,
        size: 49,
      })),
    measureElement: () => {},
  }),
}));

/**
 * Counted Qty opens EMPTY, not pre-filled with the system quantity. A
 * pre-filled count sheet cannot say which rows anyone has actually walked
 * to, and prefilling 0 instead would make every untouched row an adjustment
 * to zero stock. The field itself is the record of the count; the tick is a
 * shortcut for "counted, and it matched".
 */
describe("cycle count ledger: Counted Qty is blank until entered", () => {
  const onUpdateItem = vi.fn();
  const onCountRow = vi.fn();

  const item: AuditItem = {
    id: "p1",
    name: "Panadol",
    sku: "SKU-1",
    category: "Analgesics",
    systemQty: 10,
    countedQty: undefined,
    costPrice: 100,
    countedCostPrice: 100,
    sellingPrice: 150,
    countedSellingPrice: 150,
  };

  function renderLedger(override: Partial<AuditItem> = {}) {
    render(
      <AuditLedgerStep
        items={[{ ...item, ...override }]}
        totalItems={1}
        isLoading={false}
        isSyncing={false}
        onUpdateItem={onUpdateItem}
        onCountRow={onCountRow}
        categories={[{ id: "Analgesics", label: "Analgesics", count: 1 }]}
        selectedCategory="__all__"
        setSelectedCategory={vi.fn()}
        countStatus="all"
        setCountStatus={vi.fn()}
        countedCount={0}
        search=""
        setSearch={vi.fn()}
        scrollElementRef={createRef<HTMLDivElement>()}
      />,
    );
  }

  function countedInput() {
    return screen.getByLabelText(
      "Counted quantity for Panadol",
    ) as HTMLInputElement;
  }

  beforeEach(() => {
    onUpdateItem.mockClear();
    onCountRow.mockClear();
    cleanup();
  });

  it("renders an empty field with the system quantity as its placeholder", () => {
    renderLedger();
    expect(countedInput().value).toBe("");
    expect(countedInput().placeholder).toBe("10");
  });

  it("shows no quantity variance for a row nobody has counted", () => {
    renderLedger();
    expect(screen.getByRole("table").textContent).toContain("—");
  });

  it("leaves the tick clear until a count exists, and never disables it", () => {
    renderLedger();
    const tick = screen.getByLabelText(
      "Mark Panadol as counted",
    ) as HTMLButtonElement;
    expect(tick.getAttribute("data-state")).toBe("unchecked");
    expect(tick.disabled).toBe(false);
  });

  it("ticking asks for a count against live stock, not the figure on screen", () => {
    // "Counted, and it matched" has to mean it matched what the system says
    // right now - the row's own systemQty may be hours stale (A-263), so the
    // ledger hands the decision to countRow, which re-reads.
    renderLedger();
    act(() => {
      screen.getByLabelText("Mark Panadol as counted").click();
    });
    expect(onCountRow).toHaveBeenCalledWith("p1");
    expect(onUpdateItem).not.toHaveBeenCalled();
  });

  it("entering a quantity routes through countRow so the row is re-baselined", () => {
    renderLedger();
    const input = countedInput();
    fireEvent.change(input, { target: { value: "8" } });
    expect(onCountRow).toHaveBeenCalledWith("p1", 8);
  });

  it("un-ticking a counted row clears the count rather than zeroing it", () => {
    renderLedger({ countedQty: 10, counted: true });
    const tick = screen.getByLabelText("Mark Panadol as counted");
    expect(tick.getAttribute("data-state")).toBe("checked");
    act(() => {
      tick.click();
    });
    expect(onUpdateItem).toHaveBeenCalledWith("p1", {
      countedQty: undefined,
      counted: false,
    });
  });

  it("a counted row that matched the system shows a zero variance, not a dash", () => {
    renderLedger({ countedQty: 10, counted: true });
    expect(countedInput().value).toBe("10");
    expect(screen.getByRole("table").textContent).not.toContain("—");
  });
});
