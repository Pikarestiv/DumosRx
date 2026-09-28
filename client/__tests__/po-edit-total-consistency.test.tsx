import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import { POMobileEditView } from "@/components/procurement/po-mobile-edit-view";
import { PODesktopEditView } from "@/components/procurement/po-desktop-edit-view";
import { getOrderTotal } from "@/components/procurement/po-line-item-math";
import type { POLineItemDraft } from "@/components/procurement/po-item-ledger-table";
import type { POProduct } from "@/lib/db/queries/procurement";

if (!window.HTMLElement.prototype.scrollIntoView) {
  window.HTMLElement.prototype.scrollIntoView = () => {};
}

if (typeof CSS === "undefined" || !CSS.escape) {
  (globalThis as unknown as { CSS: { escape: (s: string) => string } }).CSS = {
    escape: (s: string) => s.replace(/[^a-zA-Z0-9_-]/g, (c) => `\\${c}`),
  };
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

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn(), replace: vi.fn(), back: vi.fn() }),
}));
vi.mock("@/lib/hooks/use-product-list", () => ({
  useProductList: () => ({ data: [] }),
}));
vi.mock("@/lib/context/store-context", () => ({
  useStore: () => ({ storeProfile: { store_type: "pharmacy" } }),
}));

/**
 * A resumed Immediate draft's header total was computed with
 * getLineTotal(item, "standard") while the rows on the same screen rendered
 * with poType "immediate", and the mobile edit view's summary drawer used a
 * third, raw `bulk_quantity * unit_cost` formula. With a "New Cost" override
 * typed those three produce different numbers, so the "Estimated total" did
 * not match the sum of the line totals shown right below it.
 */
describe("edit-view order total consistency", () => {
  const product: POProduct = {
    id: "p1",
    name: "Panadol",
    bulk_unit: "Carton",
    base_unit: "Tablet",
    units_per_bulk: 100,
    cost_price: 4,
    stock_quantity: 50,
    selling_price: 12.5,
  };

  // 2 cartons * 100 tablets * ₦5/tablet (the typed override) = ₦1,000.
  // The pre-fix formulas gave ₦800 (2 * 400) instead.
  const items: POLineItemDraft[] = [
    {
      product_id: "p1",
      product_name: "Panadol",
      bulk_unit: "Carton",
      bulk_quantity: 2,
      units_per_bulk: 100,
      unit_cost: 400,
      subtotal: 800,
      cost_price_override: 5,
    },
  ];

  const EXPECTED = 1000;

  it("getOrderTotal sums the per-line immediate totals, not the standard ones", () => {
    expect(getOrderTotal(items, "immediate")).toBe(EXPECTED);
    expect(getOrderTotal(items, "standard")).toBe(800);
  });

  it("the mobile edit view's summary drawer totals agree with the immediate line math", () => {
    render(
      <POMobileEditView
        poId="abcdef12-0000"
        selectedSupplierName="Self / Walk-in Purchase"
        poType="immediate"
        products={[product]}
        items={items}
        onItemsChange={vi.fn()}
        onOpenAddProduct={vi.fn()}
        newlyCreatedProductId={null}
        onNewlyCreatedProductConsumed={vi.fn()}
        isSubmitting={false}
        handleSubmit={vi.fn()}
        onOpenEditDetails={vi.fn()}
      />,
    );

    // The collapsed drawer trigger shows the order total.
    expect(screen.getAllByText("₦1,000").length).toBeGreaterThan(0);
    expect(screen.queryByText("₦800")).toBeNull();
  });

  it("the desktop edit view's header total agrees with the immediate line math", () => {
    render(
      <PODesktopEditView
        poId="abcdef12-0000"
        selectedSupplierName="Self / Walk-in Purchase"
        poType="immediate"
        products={[product]}
        items={items}
        onItemsChange={vi.fn()}
        onOpenAddProduct={vi.fn()}
        newlyCreatedProductId={null}
        onNewlyCreatedProductConsumed={vi.fn()}
        isSubmitting={false}
        handleSubmit={vi.fn()}
        onOpenEditDetails={vi.fn()}
      />,
    );

    expect(screen.getAllByText("₦1,000").length).toBeGreaterThan(0);
    expect(screen.queryByText("₦800")).toBeNull();
  });
});
