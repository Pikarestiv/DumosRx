import { describe, it, expect, vi } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import { act } from "react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { ReactNode } from "react";
import { ReceivePOPanel } from "@/components/procurement/receive-po-panel";
import type { PurchaseOrder } from "@/lib/db/local-database";

vi.mock("@/lib/hooks/use-permissions", () => ({
  useHasPermission: () => true,
}));
vi.mock("@/lib/db/queries/categories", () => ({
  getCategoryList: vi.fn(async () => []),
}));
// The panel's A-26 dropped-receipt banner reads the local database; this file
// is about the price fields, so the signal is stubbed away rather than
// initialising sql.js (which has no /sql-wasm.wasm under vitest).
vi.mock("@/lib/hooks/use-dropped-receipt-signal", () => ({
  useDroppedReceiptSignal: () => ({ signal: null, dismiss: vi.fn() }),
}));

function withQueryClient(ui: ReactNode) {
  return (
    <QueryClientProvider client={new QueryClient()}>{ui}</QueryClientProvider>
  );
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
 * The phone-width receiving cards only ever exposed Qty/Lot/Expiry, while
 * the desktop ledger for the same step also takes a Cost Price and a New
 * Selling Price. A vendor price change recorded on a phone was therefore
 * silently dropped, and the receive-path price-change toast could never
 * fire there.
 */
describe("ReceiveItemCard price fields", () => {
  const po = {
    id: "abcdef12-3456",
    vendor_name: "Acme Distributors",
    status: "sent",
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
        quantity_received: 0,
        current_selling_price: 12.5,
      },
    ],
  } as unknown as PurchaseOrder;

  function renderPanel() {
    return render(
      withQueryClient(
        <ReceivePOPanel po={po} onBack={vi.fn()} onConfirm={vi.fn()} />,
      ),
    );
  }

  it("shows the Cost Price placeholder at the per-base-unit scale it is actually stored at", () => {
    renderPanel();
    const input = screen.getByLabelText(
      "Cost Price per Tablet for Panadol",
    ) as HTMLInputElement;
    expect(input.getAttribute("type")).toBe("number");
    expect(input.getAttribute("placeholder")).toBe("₦4");
  });

  it("offers a New Selling Price input on the card", () => {
    renderPanel();
    const input = screen.getByLabelText(
      "New Selling Price for Panadol",
    ) as HTMLInputElement;
    expect(input.getAttribute("type")).toBe("number");
    expect(input.getAttribute("placeholder")).toBe("Unchanged");
  });

  it("carries what is typed into the new price fields through to the receive payload, clamping a negative to zero", () => {
    const onConfirm = vi.fn();
    render(
      withQueryClient(
        <ReceivePOPanel po={po} onBack={vi.fn()} onConfirm={onConfirm} />,
      ),
    );

    fireEvent.change(screen.getByLabelText("Cost Price per Tablet for Panadol"), {
      target: { value: "450" },
    });
    fireEvent.change(screen.getByLabelText("New Selling Price for Panadol"), {
      target: { value: "-5" },
    });

    act(() => {
      screen.getByRole("button", { name: "Confirm & Receive" }).click();
    });
    act(() => {
      screen.getByRole("button", { name: "Proceed Anyway" }).click();
    });

    expect(onConfirm).toHaveBeenCalledTimes(1);
    const [, payload] = onConfirm.mock.calls[0];
    expect(payload[0].cost_price).toBe("450");
    expect(payload[0].selling_price).toBe("0");
  });
});
