import { describe, it, expect, vi, beforeEach } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { ReactNode } from "react";
import { ReceivePOPanel } from "@/components/procurement/receive-po-panel";
import type { PurchaseOrder } from "@/lib/db/local-database";

const dismiss = vi.fn();
let signal: { conflictIds: number[]; lineCount: number; detectedAt: string } | null = null;

vi.mock("@/lib/hooks/use-permissions", () => ({
  useHasPermission: () => true,
}));
vi.mock("@/lib/db/queries/categories", () => ({
  getCategoryList: vi.fn(async () => []),
}));
vi.mock("@/lib/hooks/use-dropped-receipt-signal", () => ({
  useDroppedReceiptSignal: () => ({ signal, dismiss }),
}));

function withQueryClient(ui: ReactNode) {
  return <QueryClientProvider client={new QueryClient()}>{ui}</QueryClientProvider>;
}

if (!window.HTMLElement.prototype.scrollIntoView) {
  window.HTMLElement.prototype.scrollIntoView = () => {};
}
if (!window.matchMedia) {
  window.matchMedia = ((query: string) => ({
    matches: false,
    media: query,
    onchange: null,
    addListener: () => {},
    removeListener: () => {},
    addEventListener: () => {},
    removeEventListener: () => {},
    dispatchEvent: () => false,
  })) as unknown as typeof window.matchMedia;
}

/**
 * A-26: the receiving screen used to show a collapsed second receipt as an
 * ordinary outstanding balance, with nothing saying a receipt had been
 * dropped. This is the surface half of the fix.
 */
describe("ReceivePOPanel dropped-receipt warning", () => {
  const po = {
    id: "abcdef12-3456",
    vendor_name: "Acme Distributors",
    status: "partially_received",
    items: [
      {
        id: "item-1",
        product_id: "p1",
        product_name: "Panadol",
        base_unit: "Tablet",
        bulk_unit: "Carton",
        bulk_quantity: 3,
        units_per_bulk: 100,
        product_units_per_bulk: 100,
        unit_cost: 400,
        subtotal: 1200,
        quantity_received: 1,
        current_selling_price: 12.5,
      },
    ],
  } as unknown as PurchaseOrder;

  const renderPanel = () =>
    render(withQueryClient(<ReceivePOPanel po={po} onBack={vi.fn()} onConfirm={vi.fn()} />));

  beforeEach(() => {
    dismiss.mockClear();
    signal = null;
  });

  it("says nothing when no receipt against this order was dropped", () => {
    renderPanel();

    expect(screen.queryByTestId("dropped-receipt-warning")).toBeNull();
  });

  it("warns that a receipt may not have been applied, and tells the store what to do", () => {
    signal = { conflictIds: [1], lineCount: 1, detectedAt: "2026-10-01T00:00:00.000Z" };
    renderPanel();

    const warning = screen.getByTestId("dropped-receipt-warning");
    expect(warning.textContent).toContain("may not have been applied");
    expect(warning.textContent).toContain("One line's received quantity");
    expect(warning.textContent).toContain("receive any remainder");
  });

  it("pluralises the affected-line count", () => {
    signal = { conflictIds: [1, 2], lineCount: 2, detectedAt: "2026-10-01T00:00:00.000Z" };
    renderPanel();

    expect(screen.getByTestId("dropped-receipt-warning").textContent).toContain(
      "2 lines' received quantities",
    );
  });

  it("dismisses the warning through the ledger rather than only hiding it locally", () => {
    signal = { conflictIds: [7], lineCount: 1, detectedAt: "2026-10-01T00:00:00.000Z" };
    renderPanel();

    fireEvent.click(screen.getByRole("button", { name: /I've checked this/i }));

    expect(dismiss).toHaveBeenCalledTimes(1);
  });
});
