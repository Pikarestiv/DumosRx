import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { ProductStockInfo } from "@/components/products/product-details/product-stock-info";
import { ProductBatchHistory } from "@/components/products/product-details/product-batch-history";
import type { Product } from "@/components/products/product-details/use-product-details";
import type { StockBatch } from "@/lib/types/stock-batch";

const product = {
  id: "p1",
  name: "Amoxil",
  stockQuantity: 36,
  reorderLevel: 8,
  baseUnit: "tab",
  bulkUnit: "box",
  unitsPerBulk: 12,
} as Product;

function renderStockInfo(canSeeQuantities: boolean, overrides: Partial<Product> = {}) {
  return render(
    <ProductStockInfo
      product={{ ...product, ...overrides }}
      formatDate={(d) => d}
      daysToExpiry={400}
      expiryWarningDays={90}
      canSeeQuantities={canSeeQuantities}
    />,
  );
}

const batch = {
  id: "b1",
  product_id: "p1",
  batch_number: "LOT-9",
  quantity: 29,
  expiry_date: "2099-01-01",
  is_active: 1,
} as StockBatch;

describe("Product details and view_stock_quantities", () => {
  it("shows the current stock and bulk total with the permission", () => {
    renderStockInfo(true);
    expect(screen.queryByText("36 tab(s)")).not.toBeNull();
    expect(screen.queryByText(/Total Stock \(in box\)/)).not.toBeNull();
  });

  it("shows a status word and no bulk total without it", () => {
    const { container } = renderStockInfo(false);
    expect(screen.queryByText("In stock")).not.toBeNull();
    expect(screen.queryByText(/Total Stock/)).toBeNull();
    expect(container.textContent).not.toContain("36");
    expect(container.textContent).not.toContain("3.00");
  });

  it("says Low stock for a product at or under its reorder level without the permission", () => {
    renderStockInfo(false, { stockQuantity: 5 });
    expect(screen.queryByText("Low stock")).not.toBeNull();
  });

  it("lists batch units with the permission", () => {
    render(<ProductBatchHistory batches={[batch]} loadingBatches={false} storeType="pharmacy" canSeeQuantities />);
    expect(screen.queryByText(/29 units/)).not.toBeNull();
  });

  it("keeps batch number, expiry and the FEFO hint but drops units without it", () => {
    const { container } = render(
      <ProductBatchHistory batches={[batch]} loadingBatches={false} storeType="pharmacy" canSeeQuantities={false} />,
    );
    expect(screen.queryByText("Batch #LOT-9")).not.toBeNull();
    expect(screen.queryByText(/Sell first \(FEFO\)/)).not.toBeNull();
    expect(container.textContent).not.toContain("29");
  });
});
