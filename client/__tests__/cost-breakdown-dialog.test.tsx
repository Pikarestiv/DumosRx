import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";

vi.mock("idb-keyval", () => ({ get: vi.fn(() => Promise.resolve(undefined)), set: vi.fn(() => Promise.resolve(undefined)) }));
vi.mock("@/lib/context/store-context", () => ({ useStore: () => ({ storeProfile: { uppercase_display_enabled: 0 } }) }));

import { CostBreakdownDialog } from "@/components/products/batch-cost/cost-breakdown-dialog";
import type { StockBatch } from "@/lib/types/stock-batch";

const batch = (fields: Partial<StockBatch>) =>
  ({ id: "b", product_id: "p1", quantity: 1, cost_price: 800, expiry_date: null, created_at: "2026-11-06T10:00:00Z", ...fields }) as StockBatch;

const renderDialog = (batches: StockBatch[]) =>
  render(
    <QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 } } })}>
      <CostBreakdownDialog
        open
        onOpenChange={vi.fn()}
        productName="visita soap big"
        batches={batches}
        sellingPrice={1500}
        formatPrice={(n) => `₦${n}`}
      />
    </QueryClientProvider>,
  );

describe("cost breakdown dialog", () => {
  it("names a purchase-order batch by its PO number once, not 'PO PO-…'", () => {
    renderDialog([batch({ id: "b1", purchase_order_id: "85d9c79d-0000-4000-8000-000000000001" })]);
    expect(screen.getByText(/From PO-85D9C79D · Lot Default · no expiry/)).toBeTruthy();
    expect(document.body.textContent).not.toContain("PO PO-");
    expect(document.body.textContent).not.toContain("From PO PO-");
  });

  it("falls back to the supplier, then to no source at all, for a batch with no purchase order", () => {
    renderDialog([batch({ id: "b1", supplier_name: "Emzor" }), batch({ id: "b2", created_at: "2026-11-07T10:00:00Z" })]);
    expect(screen.getByText(/From Emzor · Lot Default · no expiry/)).toBeTruthy();
    expect(screen.getByText(/^Lot Default · no expiry/)).toBeTruthy();
  });

  it("shows the product name in the store's display casing", () => {
    renderDialog([batch({ id: "b1" })]);
    expect(screen.getByText(/Visita Soap Big · 1 batch in stock/)).toBeTruthy();
  });

  it("does not repeat the PO number as a lot when the lot is just the PO's id", () => {
    renderDialog([batch({ id: "b1", purchase_order_id: "85d9c79d-0000-4000-8000-000000000001", batch_number: "85D9C79D" })]);
    expect(screen.getByText("From PO-85D9C79D · no expiry")).toBeTruthy();
  });

  it("still shows a real lot number beside the PO number", () => {
    renderDialog([batch({ id: "b1", purchase_order_id: "85d9c79d-0000-4000-8000-000000000001", batch_number: "LOT-9" })]);
    expect(screen.getByText("From PO-85D9C79D · Lot LOT-9 · no expiry")).toBeTruthy();
  });

  it("says '1 unit', not '1 units', when the batch that sells first holds one unit", () => {
    render(
      <QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 } } })}>
        <CostBreakdownDialog
          open
          onOpenChange={vi.fn()}
          productName="Soap"
          batches={[batch({ id: "early", batch_number: "A", quantity: 1, cost_price: 650 }), batch({ id: "late", batch_number: "B", created_at: "2026-11-07T10:00:00Z" })]}
          initialEditBatchId="late"
          formatPrice={(n) => `₦${n}`}
        />
      </QueryClientProvider>,
    );
    expect(document.body.textContent).toContain("Batch A (1 unit at ₦650) will sell before this one.");
  });
});
