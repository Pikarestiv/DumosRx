import { describe, it, expect, vi } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";

const push = vi.fn();
vi.mock("next/navigation", () => ({ useRouter: () => ({ push }) }));

import { ProductOverviewCards } from "@/components/products/product-details/product-overview-cards";
import { ProductDetailTabNav } from "@/components/products/product-detail-tab-nav";
import { Tabs } from "@/components/ui/tabs";
import type { Product } from "@/components/products/types";
import type { StockBatch } from "@/lib/types/stock-batch";

const product = {
  id: "p1",
  name: "Visita Soap Big",
  category: "Toiletries",
  barcode: "1003",
  sellingPrice: 1500,
  stockQuantity: 15,
  reorderLevel: 5,
  lastAuditedAt: null,
} as unknown as Product;

const batch = (id: string, quantity: number, cost: number, created: string) =>
  ({ id, product_id: "p1", quantity, cost_price: cost, created_at: created, expiry_date: null }) as unknown as StockBatch;

const batches = [
  batch("b1", 13, 650, "2026-10-01T08:00:00Z"),
  batch("b2", 1, 800, "2026-10-05T08:00:00Z"),
  batch("b3", 1, 800, "2026-10-09T08:00:00Z"),
];

const renderCards = (overrides: Partial<Parameters<typeof ProductOverviewCards>[0]> = {}) =>
  render(
    <ProductOverviewCards
      product={product}
      batches={batches}
      creator={{ name: "Pikalocal Restiv", created_at: "2026-10-13T14:05:00" }}
      formatPrice={(n) => `₦${n}`}
      onOpenCostBreakdown={vi.fn()}
      onEditProduct={vi.fn()}
      {...overrides}
    />,
  );

describe("product details cards", () => {
  it("shows margin and profit worked out from the batch-weighted average cost", () => {
    renderCards();
    expect(screen.getByText("Avg cost ₦670")).toBeTruthy();
    expect(screen.getByText("55.3%", { selector: "div.text-xl" })).toBeTruthy();
    expect(screen.getByText("₦830 profit per unit")).toBeTruthy();
    expect(screen.getByText("Markup on avg cost: 123.9%")).toBeTruthy();
  });

  it("opens the cost breakdown from the 'From N batches' link", () => {
    const onOpenCostBreakdown = vi.fn();
    renderCards({ onOpenCostBreakdown });
    fireEvent.click(screen.getByRole("button", { name: /From 3 batches/ }));
    expect(onOpenCostBreakdown).toHaveBeenCalledOnce();
  });

  it("hides every cost-derived figure from a user who may not view cost", () => {
    renderCards({ canViewCost: false });
    expect(screen.queryByText(/Avg cost ₦/)).toBeNull();
    expect(screen.queryByText(/profit per unit/)).toBeNull();
    expect(screen.queryByText(/Markup/)).toBeNull();
    expect(screen.queryByRole("button", { name: /From 3 batches/ })).toBeNull();
  });

  it("says a product was never counted until it has been", () => {
    renderCards();
    expect(screen.getByText("Never")).toBeTruthy();
  });

  it("shows when the product was last counted, with its time", () => {
    renderCards({ product: { ...product, lastAuditedAt: "2026-11-02T09:30:00" } as Product });
    expect(screen.queryByText("Never")).toBeNull();
    expect(screen.getByText("02/11/2026 09:30")).toBeTruthy();
  });

  it("sends 'Count now' to the stock adjustment screen for this product", () => {
    renderCards();
    fireEvent.click(screen.getByRole("button", { name: "Count now" }));
    expect(push).toHaveBeenCalledWith("/inventory/batches?action=adjust&productId=p1");
  });

  it("offers Add details when the product has no generic name or dosage form", () => {
    renderCards();
    expect(screen.getByRole("button", { name: /Add details/ })).toBeTruthy();
  });
});

describe("product detail tab bar", () => {
  it("shows the batch count and keeps the active tab's label readable as the selected tab", () => {
    render(
      <Tabs value="batches">
        <ProductDetailTabNav batchCount={3} />
      </Tabs>,
    );
    const active = screen.getByRole("tab", { name: "Batches (3)" });
    expect(active.getAttribute("aria-selected")).toBe("true");
    expect(active.className).toContain("data-[state=active]:bg-transparent");
    expect(screen.getByRole("tab", { name: "Details" }).getAttribute("aria-selected")).toBe("false");
    expect(screen.getByRole("tab", { name: "Movements" })).toBeTruthy();
  });
});
