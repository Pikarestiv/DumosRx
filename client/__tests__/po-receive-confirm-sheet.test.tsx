import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";
import { act } from "react";
import { POImmediateConfirmDialog } from "@/components/procurement/po-immediate-confirm-dialog";
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

vi.mock("@/components/procurement/owed-settlement-notice", () => ({ OwedSettlementNotice: () => null }));

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
 * Receiving writes stock irreversibly, so the button has to name the action
 * and the receive has to be confirmed first with a summary of what it does.
 * Which buttons a new order offers depends on its vendor.
 */
describe("receive confirmation sheet", () => {
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
  const line = (overrides: Partial<POLineItemDraft> = {}): POLineItemDraft => ({
    product_id: "p1",
    product_name: "Panadol",
    bulk_unit: "Carton",
    bulk_quantity: 2,
    units_per_bulk: 100,
    unit_cost: 400,
    subtotal: 800,
    ...overrides,
  });
  const onConfirm = vi.fn();

  beforeEach(() => {
    onConfirm.mockClear();
    document.body.innerHTML = "";
  });

  function open(items: POLineItemDraft[], products: POProduct[] = [product], skippedItems: POLineItemDraft[] = []) {
    render(
      <POImmediateConfirmDialog
        open
        onOpenChange={vi.fn()}
        items={items}
        skippedItems={skippedItems}
        products={products}
        totalAmount={800}
        onConfirm={onConfirm}
      />,
    );
    return screen.getByRole("alertdialog");
  }

  it("summarises units, total and that no selling price changes", () => {
    const dialog = open([line()]);
    expect(dialog.textContent).toContain("200 units of PANADOL");
    expect(dialog.textContent).not.toContain("1 item");
    expect(dialog.textContent).toContain("₦800");
    expect(dialog.textContent).toContain("No selling price will change.");
  });

  it("receives once the confirmation is accepted", () => {
    open([line()]);
    act(() => {
      screen.getByRole("button", { name: "Receive Purchase" }).click();
    });
    expect(onConfirm).toHaveBeenCalledTimes(1);
  });

  it("says how many products will sell at or below cost or on a thinner margin", () => {
    const dialog = open(
      [line({ cost_price_override: 13 }), line({ product_id: "p2", product_name: "Amoxil", cost_price_override: 5 })],
      [product, { ...product, id: "p2", name: "Amoxil" }],
    );
    expect(dialog.textContent).toContain("1 product will sell at or below this cost");
    expect(dialog.textContent).toContain("1 product will earn a thinner margin than before");
  });

  it("names the uncounted lines it will leave off the receipt", () => {
    const dialog = open([line()], [product], [line({ product_id: "p2", product_name: "Amoxil", bulk_quantity: 0 })]);
    expect(dialog.textContent).toContain("AMOXIL has no quantity and will be left off this receipt");
  });

  it("warns when receiving an item with zero cost price", () => {
    const dialog = open([line({ unit_cost: 0, subtotal: 0 })]);
    expect(dialog.textContent).toContain("Zero Cost Price (₦0): PANADOL");
    expect(dialog.textContent).toContain("distort your inventory valuation");
    expect(screen.getByRole("button", { name: "Go Back & Edit Prices" })).toBeTruthy();
    act(() => {
      screen.getByRole("button", { name: "Receive with ₦0 Cost" }).click();
    });
    expect(onConfirm).toHaveBeenCalledTimes(1);
  });

  it("warns when the product's own selling price is zero, whatever an old line carried", () => {
    const dialog = open([line({ selling_price: 20 })], [{ ...product, selling_price: 0 }]);
    expect(dialog.textContent).toContain("Zero Selling Price (₦0): PANADOL");
    expect(dialog.textContent).toContain("sold for free (₦0)");
    expect(screen.getByRole("button", { name: "Receive with ₦0 Sell Price" })).toBeTruthy();
  });

  it("warns when both cost price and selling price are zero", () => {
    const dialog = open([line({ unit_cost: 0, subtotal: 0 })], [{ ...product, selling_price: 0 }]);
    expect(dialog.textContent).toContain("Zero Cost Price (₦0): PANADOL");
    expect(dialog.textContent).toContain("Zero Selling Price (₦0): PANADOL");
    expect(screen.getByRole("button", { name: "Receive with ₦0 Cost & Sell Price" })).toBeTruthy();
  });
});
