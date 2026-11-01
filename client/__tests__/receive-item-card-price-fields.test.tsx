import { describe, it, expect, vi } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import { act } from "react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { ReactNode } from "react";
import { ReceivePOPanel } from "@/components/procurement/receive-po-panel";
import type { PurchaseOrder } from "@/lib/db/local-database";

// Product names now render through ProductName, which reads the store's
// casing setting; these specs mount their component without a provider.
const storeProfile = vi.hoisted(() => ({
  uppercase_display_enabled: 1,
  currency: undefined as string | undefined,
}));
vi.mock("@/lib/context/store-context", () => ({
  useStore: () => ({ storeProfile }),
}));

vi.mock("@/lib/hooks/use-permissions", () => ({
  useHasPermission: () => true,
}));
vi.mock("@/lib/db/queries/categories", () => ({
  getCategoryList: vi.fn(() => Promise.resolve([])),
}));
// The panel's A-26 dropped-receipt banner reads the local database; this file is about the price fields, so the signal is…
// Rationale: docs/CLIENT_COMMENTS.md#line-__tests__-receive-item-card-price-fields-test-tsx-L21
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

// The phone-width receiving cards only ever exposed Qty/Lot/Expiry, while the desktop ledger for the same step also takes…
// Rationale: docs/CLIENT_COMMENTS.md#block-__tests__-receive-item-card-price-fields-test-tsx-L51
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
    expect(input.getAttribute("placeholder")).toBe("₦12.5");
  });

  it("formats the receive placeholders in the store's currency, not the default naira", () => {
    storeProfile.currency = "XAF";
    try {
      renderPanel();
      const price = screen.getByLabelText("New Selling Price for Panadol") as HTMLInputElement;
      const cost = screen.getByLabelText("Cost Price per Tablet for Panadol") as HTMLInputElement;
      expect(price.getAttribute("placeholder")).not.toContain("₦");
      expect(price.getAttribute("placeholder")).toMatch(/13|12/);
      expect(cost.getAttribute("placeholder")).not.toContain("₦");
    } finally {
      storeProfile.currency = undefined;
    }
  });

  it("keeps the order's cost on a follow-up receipt but not its lot or expiry, which belong to one delivery", () => {
    const partialPo = {
      ...po,
      type: "immediate",
      status: "partially_received",
      items: [
        {
          ...(po.items ?? [])[0],
          quantity_received: 1,
          cost_price_override: 4.5,
          lot_number: "LOT-9",
          expiry_date: "2027-03-01",
        },
      ],
    } as unknown as PurchaseOrder;
    render(withQueryClient(<ReceivePOPanel po={partialPo} onBack={vi.fn()} onConfirm={vi.fn()} />));

    expect((screen.getByLabelText("Cost Price per Tablet for Panadol") as HTMLInputElement).value).toBe("4.5");
    expect((screen.getByLabelText("Lot or batch number for Panadol") as HTMLInputElement).value).toBe("");
  });

  it("seeds nothing for a Standard order, whose lines never had those inputs", () => {
    const standardPo = {
      ...po,
      type: "standard",
      items: [
        { ...(po.items ?? [])[0], cost_price_override: 4.5, lot_number: "LOT-9", expiry_date: "2027-03-01" },
      ],
    } as unknown as PurchaseOrder;
    render(withQueryClient(<ReceivePOPanel po={standardPo} onBack={vi.fn()} onConfirm={vi.fn()} />));

    expect((screen.getByLabelText("Cost Price per Tablet for Panadol") as HTMLInputElement).value).toBe("");
    expect((screen.getByLabelText("Lot or batch number for Panadol") as HTMLInputElement).value).toBe("");
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
  it("prefills the cost, lot and expiry that were saved on the order line", () => {
    const onConfirm = vi.fn();
    const savedPo = {
      ...po,
      type: "immediate",
      items: [
        {
          ...(po.items ?? [])[0],
          selling_price: 15,
          cost_price_override: 4.5,
          lot_number: "LOT-9",
          expiry_date: "2027-03-01",
        },
      ],
    } as unknown as PurchaseOrder;
    render(
      withQueryClient(
        <ReceivePOPanel po={savedPo} onBack={vi.fn()} onConfirm={onConfirm} />,
      ),
    );

    expect(
      (screen.getByLabelText("New Selling Price for Panadol") as HTMLInputElement).value,
    ).toBe("");
    expect(
      (screen.getByLabelText("Cost Price per Tablet for Panadol") as HTMLInputElement).value,
    ).toBe("4.5");

    act(() => {
      screen.getByRole("button", { name: "Confirm & Receive" }).click();
    });
    const [, payload] = onConfirm.mock.calls[0];
    expect(payload[0]).toMatchObject({
      cost_price: 4.5,
      lot_number: "LOT-9",
      expiry_date: "2027-03-01",
    });
  });
});
