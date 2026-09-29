import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { ProductBatchHistory } from "@/components/products/product-details/product-batch-history";
import type { StockBatch } from "@/lib/types/stock-batch";

/**
 * Regression coverage: a batch with no expiry_date fell back to
 * `new Date(0)` (the Unix epoch), which is always in the past, so every
 * non-perishable batch showed "Expired" instead of a neutral "No expiry".
 */
function batch(overrides: Partial<StockBatch> = {}): StockBatch {
  return {
    id: "b1",
    product_id: "p1",
    batch_number: "B-1",
    quantity: 10,
    ...overrides,
  };
}

describe("ProductBatchHistory expiry status", () => {
  it("shows 'No expiry' rather than 'Expired' for a batch with no expiry date", () => {
    const batches = [batch({ expiry_date: undefined })];

    render(
      <ProductBatchHistory batches={batches} loadingBatches={false} storeType="pharmacy" />,
    );

    expect(screen.getByText("No expiry")).toBeTruthy();
    expect(screen.queryByText("Expired")).toBeNull();
  });

  it("still shows Expired for a batch with a real past expiry date", () => {
    const batches = [batch({ expiry_date: "2020-01-01" })];

    render(
      <ProductBatchHistory batches={batches} loadingBatches={false} storeType="pharmacy" />,
    );

    expect(screen.getByText("Expired")).toBeTruthy();
  });

  it("still shows a days-remaining count for a batch with a future expiry date", () => {
    const future = new Date();
    future.setDate(future.getDate() + 200);
    const isoDate = future.toISOString().slice(0, 10);
    const batches = [batch({ expiry_date: isoDate })];

    render(
      <ProductBatchHistory batches={batches} loadingBatches={false} storeType="pharmacy" />,
    );

    expect(screen.getByText(/Expires in \d+ days/)).toBeTruthy();
  });
});
