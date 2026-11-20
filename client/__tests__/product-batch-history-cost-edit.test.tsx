import { describe, it, expect, vi } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";

vi.mock("idb-keyval", () => ({ get: vi.fn(() => Promise.resolve(undefined)), set: vi.fn(() => Promise.resolve(undefined)) }));
vi.mock("@/lib/context/store-context", () => ({ useStore: () => ({ storeProfile: { uppercase_display_enabled: 0 } }) }));

import { ProductBatchHistory } from "@/components/products/product-details/product-batch-history";
import type { StockBatch } from "@/lib/types/stock-batch";

const batches = [
  { id: "b1", product_id: "p1", batch_number: "LOT-1", quantity: 13, cost_price: 650, is_active: 1, created_at: "2026-10-01T08:00:00Z" },
  { id: "b2", product_id: "p1", batch_number: "LOT-2", quantity: 1, cost_price: 800, is_active: 1, created_at: "2026-10-05T08:00:00Z" },
] as StockBatch[];

const renderHistory = (canEditCost: boolean, canViewCost = true) =>
  render(
    <QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 } } })}>
      <ProductBatchHistory
        batches={batches}
        loadingBatches={false}
        storeType="pharmacy"
        canSeeQuantities
        canViewCost={canViewCost}
        canEditCost={canEditCost}
        productName="Soap"
        sellingPrice={1500}
      />
    </QueryClientProvider>,
  );

describe("batches tab cost editing", () => {
  it("opens the cost breakdown already editing the batch whose pencil was tapped", () => {
    renderHistory(true);
    fireEvent.click(screen.getByRole("button", { name: "Edit cost price for batch LOT-2" }));

    const input = screen.getByLabelText(/new cost price/i) as HTMLInputElement;
    expect(input.value).toBe("800");
    expect(screen.getByText("Received 05/10/2026", { exact: false })).toBeTruthy();
    expect(screen.getByRole("button", { name: /save correction/i })).toBeTruthy();
  });

  it("offers no pencil to a user who cannot edit or cannot view cost", () => {
    renderHistory(false);
    expect(screen.queryByRole("button", { name: /Edit cost price for batch/ })).toBeNull();
  });
});

describe("batches tab cost editing of a sold-out batch", () => {
  it("shows the row being edited instead of hiding it behind the sold-out toggle", () => {
    render(
      <QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 } } })}>
        <ProductBatchHistory
          batches={[{ ...batches[0], quantity: 0 }, batches[1]]}
          loadingBatches={false}
          storeType="pharmacy"
          canSeeQuantities
          canViewCost
          canEditCost
          productName="Soap"
        />
      </QueryClientProvider>,
    );
    fireEvent.click(screen.getByRole("button", { name: "Edit cost price for batch LOT-1" }));
    expect((screen.getByLabelText(/new cost price/i) as HTMLInputElement).value).toBe("650");
  });
});

describe("batches tab batch details editing", () => {
  const renderWith = (onEditBatchDetails?: (batch: StockBatch) => void) =>
    render(
      <QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 } } })}>
        <ProductBatchHistory batches={batches} loadingBatches={false} storeType="pharmacy" canSeeQuantities canViewCost onEditBatchDetails={onEditBatchDetails} />
      </QueryClientProvider>,
    );

  it("hands the batch to the editor when its details button is tapped", () => {
    const onEditBatchDetails = vi.fn();
    renderWith(onEditBatchDetails);

    fireEvent.click(screen.getByRole("button", { name: "Edit details for batch LOT-2" }));

    expect(onEditBatchDetails).toHaveBeenCalledWith(expect.objectContaining({ id: "b2" }));
  });

  it("offers no details button to a user who may not edit batch details", () => {
    renderWith();

    expect(screen.queryByRole("button", { name: /Edit details for batch/ })).toBeNull();
  });
});
