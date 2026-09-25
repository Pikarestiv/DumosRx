import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { ProductBatchHistory } from "@/components/products/product-details/product-batch-history";
import type { StockBatch } from "@/lib/types/stock-batch";

/**
 * Regression coverage: every batch in this panel used to show a hardcoded
 * "Sell first (FEFO)" label, rather than only the one batch FEFO would
 * actually dispense from first (earliest expiry among active, in-stock,
 * not-yet-expired batches - matching the real sale-deduction order).
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

describe("ProductBatchHistory FEFO label", () => {
  it("labels only the batch with the earliest expiry, not every batch", () => {
    const batches = [
      batch({ id: "later", batch_number: "LATER", expiry_date: "2027-06-01" }),
      batch({ id: "sooner", batch_number: "SOONER", expiry_date: "2027-01-01" }),
    ];

    render(
      <ProductBatchHistory batches={batches} loadingBatches={false} storeType="pharmacy" />,
    );

    const soonerCard = screen.getByText("Batch #SOONER").closest("div.bg-card");
    const laterCard = screen.getByText("Batch #LATER").closest("div.bg-card");

    expect(soonerCard?.textContent).toContain("Sell first (FEFO)");
    expect(laterCard?.textContent).not.toContain("Sell first (FEFO)");
  });

  it("treats a null expiry as sorting after any dated batch", () => {
    const batches = [
      batch({ id: "no-expiry", batch_number: "NOEXP", expiry_date: undefined }),
      batch({ id: "dated", batch_number: "DATED", expiry_date: "2027-01-01" }),
    ];

    render(
      <ProductBatchHistory batches={batches} loadingBatches={false} storeType="pharmacy" />,
    );

    const datedCard = screen.getByText("Batch #DATED").closest("div.bg-card");
    const noExpiryCard = screen.getByText("Batch #NOEXP").closest("div.bg-card");

    expect(datedCard?.textContent).toContain("Sell first (FEFO)");
    expect(noExpiryCard?.textContent).not.toContain("Sell first (FEFO)");
  });

  it("skips an inactive, depleted, or already-expired batch even if it expires soonest", () => {
    const batches = [
      batch({ id: "inactive", batch_number: "INACTIVE", expiry_date: "2027-01-01", is_active: 0 }),
      batch({ id: "depleted", batch_number: "DEPLETED", expiry_date: "2027-01-05", quantity: 0 }),
      batch({ id: "already-expired", batch_number: "EXPIRED", expiry_date: "2020-01-01" }),
      batch({ id: "eligible", batch_number: "ELIGIBLE", expiry_date: "2027-06-01" }),
    ];

    render(
      <ProductBatchHistory batches={batches} loadingBatches={false} storeType="pharmacy" />,
    );

    expect(screen.getByText("Batch #ELIGIBLE").closest("div.bg-card")?.textContent).toContain(
      "Sell first (FEFO)",
    );
    for (const label of ["INACTIVE", "DEPLETED", "EXPIRED"]) {
      expect(screen.getByText(`Batch #${label}`).closest("div.bg-card")?.textContent).not.toContain(
        "Sell first (FEFO)",
      );
    }
  });
});
