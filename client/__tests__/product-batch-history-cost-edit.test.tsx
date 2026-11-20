import { describe, it, expect, vi } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import { ProductBatchHistory } from "@/components/products/product-details/product-batch-history";
import type { StockBatch } from "@/lib/types/stock-batch";

const batches = [
  { id: "b1", product_id: "p1", batch_number: "LOT-1", quantity: 13, cost_price: 650, is_active: 1, created_at: "2026-10-01T08:00:00Z" },
  { id: "b2", product_id: "p1", batch_number: "LOT-2", quantity: 1, cost_price: 800, is_active: 1, created_at: "2026-10-05T08:00:00Z" },
] as StockBatch[];

const renderHistory = (onEditBatch?: (batch: StockBatch) => void) =>
  render(
    <ProductBatchHistory batches={batches} loadingBatches={false} storeType="pharmacy" canSeeQuantities canViewCost onEditBatch={onEditBatch} />,
  );

describe("batches tab editing", () => {
  it("hands the batch to the editor when its one edit button is tapped", () => {
    const onEditBatch = vi.fn();
    renderHistory(onEditBatch);

    fireEvent.click(screen.getByRole("button", { name: "Edit batch LOT-2" }));

    expect(onEditBatch).toHaveBeenCalledWith(expect.objectContaining({ id: "b2" }));
  });

  it("puts exactly one edit button on each batch", () => {
    renderHistory(vi.fn());

    expect(screen.getAllByRole("button", { name: /^Edit batch / })).toHaveLength(2);
    expect(screen.queryByRole("button", { name: /Edit cost price|Edit details/ })).toBeNull();
  });

  it("offers no edit button to a user who may not edit batches", () => {
    renderHistory();

    expect(screen.queryByRole("button", { name: /^Edit batch / })).toBeNull();
  });
});
