import { describe, it, expect } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { ProductBatchHistory } from "@/components/products/product-details/product-batch-history";
import type { StockBatch } from "@/lib/types/stock-batch";

function makeBatch(overrides: Partial<StockBatch> = {}): StockBatch {
  return {
    id: "b1",
    product_id: "p1",
    batch_number: "BATCH-001",
    quantity: 15,
    cost_price: 1200,
    location: "Shelf A-1",
    supplier_name: "Emzor Pharma",
    created_at: "2026-05-10T14:30:00Z",
    expiry_date: "2027-11-20",
    manufacture_date: "2026-04-01",
    is_active: 1,
    ...overrides,
  };
}

describe("ProductBatchHistory accordion and details", () => {
  it("auto-expands details when there is only one batch", () => {
    const batches = [makeBatch()];

    render(
      <ProductBatchHistory
        batches={batches}
        loadingBatches={false}
        storeType="pharmacy"
        canSeeQuantities
        formatPrice={(amount) => `₦${amount.toLocaleString()}`}
      />,
    );

    expect(screen.getByText("Batch #BATCH-001")).toBeTruthy();
    expect(screen.getByText("Shelf A-1")).toBeTruthy();
    expect(screen.getByText("Emzor Pharma")).toBeTruthy();
    expect(screen.getByText("Cost Price")).toBeTruthy();
  });

  it("expands a card on click and closes the previously opened card", () => {
    const batches = [
      makeBatch({ id: "b1", batch_number: "FIRST", cost_price: 500, location: "Shelf 1" }),
      makeBatch({ id: "b2", batch_number: "SECOND", cost_price: 800, location: "Shelf 2" }),
    ];

    render(
      <ProductBatchHistory
        batches={batches}
        loadingBatches={false}
        storeType="pharmacy"
        canSeeQuantities
        formatPrice={(amount) => `₦${amount.toLocaleString()}`}
      />,
    );

    const firstCard = screen.getByText("Batch #FIRST").closest("div.bg-card")!;
    const secondCard = screen.getByText("Batch #SECOND").closest("div.bg-card")!;

    expect(screen.queryByText("Shelf 1")).toBeNull();
    expect(screen.queryByText("Shelf 2")).toBeNull();

    fireEvent.click(firstCard);
    expect(screen.getByText("Shelf 1")).toBeTruthy();
    expect(screen.queryByText("Shelf 2")).toBeNull();

    fireEvent.click(secondCard);
    expect(screen.queryByText("Shelf 1")).toBeNull();
    expect(screen.getByText("Shelf 2")).toBeTruthy();

    fireEvent.click(secondCard);
    expect(screen.queryByText("Shelf 1")).toBeNull();
    expect(screen.queryByText("Shelf 2")).toBeNull();
  });

  it("hides unit quantities and total value when canSeeQuantities is false", () => {
    const batches = [
      makeBatch({ id: "b1", batch_number: "RESTRICTED", quantity: 42, cost_price: 1000 }),
    ];

    const { container } = render(
      <ProductBatchHistory
        batches={batches}
        loadingBatches={false}
        storeType="pharmacy"
        canSeeQuantities={false}
        formatPrice={(amount) => `₦${amount.toLocaleString()}`}
      />,
    );

    expect(container.textContent).not.toContain("42");
    expect(container.textContent).not.toContain("42,000");
  });
});
