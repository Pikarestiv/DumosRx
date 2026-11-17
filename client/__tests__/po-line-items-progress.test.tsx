import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";

vi.mock("@/lib/context/store-context", () => ({
  useStore: () => ({ storeProfile: { currency: "NGN", uppercase_display_enabled: 0 } }),
}));

import { PoLineItems } from "@/components/procurement/po-line-items";
import { PoStatusTimeline } from "@/components/procurement/po-status-timeline";
import type { PurchaseOrder } from "@/lib/db/procurement";

function order(overrides: Partial<PurchaseOrder>): PurchaseOrder {
  return {
    id: "po1",
    status: "partially_received",
    type: "standard",
    total_amount: 17669000,
    items: [
      { product_name: "Coartem", bulk_quantity: 400, quantity_received: 250, unit_cost: 44000, subtotal: 17600000 },
      { product_name: "Norvasc", bulk_quantity: 60, quantity_received: 60, unit_cost: 1150, subtotal: 69000 },
    ],
    ...overrides,
  } as unknown as PurchaseOrder;
}

describe("PO line items", () => {
  it("shows how much of each line has arrived on a partially received order", () => {
    render(<PoLineItems po={order({})} />);
    expect(screen.getByText("Line Items · 2")).toBeTruthy();
    expect(screen.getByText("Received 250 of 400")).toBeTruthy();
    expect(screen.getByText("All received")).toBeTruthy();
  });

  it("shows no receiving progress before anything is received", () => {
    render(<PoLineItems po={order({ status: "sent" })} />);
    expect(screen.queryByText(/Received \d+ of/)).toBeNull();
    expect(screen.queryByText("All received")).toBeNull();
  });
});

describe("PO status steps", () => {
  it("labels the last step Partially received when some items are in", () => {
    render(<PoStatusTimeline po={order({})} />);
    expect(screen.getByText("Partially received")).toBeTruthy();
    expect(screen.getByText("Sent")).toBeTruthy();
  });

  it("skips the Sent step for an immediate purchase", () => {
    render(<PoStatusTimeline po={order({ type: "immediate", status: "received" })} />);
    expect(screen.queryByText("Sent")).toBeNull();
    expect(screen.getByText("Received")).toBeTruthy();
  });
});
