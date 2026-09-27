import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import { POItemBuilder } from "@/components/procurement/po-item-builder";
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

vi.mock("@/lib/hooks/use-product-list", () => ({
  useProductList: () => ({ data: [] }),
}));
vi.mock("@/lib/context/store-context", () => ({
  useStore: () => ({ storeProfile: { store_type: "pharmacy" } }),
}));

/**
 * Staff's first instinct on this screen is to start typing an item name
 * right away - the search bar should already have focus on mount, and the
 * empty item list's own empty state should offer an explicit way back into
 * it too, rather than only ever being reachable by scrolling up.
 */
describe("POItemBuilder search entry point", () => {
  const product: POProduct = {
    id: "p1",
    name: "Panadol",
    bulk_unit: "Carton",
    base_unit: "Tablet",
    units_per_bulk: 100,
    cost_price: 400,
    stock_quantity: 50,
    selling_price: 12.5,
  };

  it("focuses the search input on mount", () => {
    render(
      <POItemBuilder
        poType="immediate"
        products={[product]}
        items={[]}
        onItemsChange={vi.fn()}
        onOpenAddProduct={vi.fn()}
      />,
    );

    const input = screen.getByPlaceholderText("Search item by name, SKU or barcode");
    expect(document.activeElement).toBe(input);
  });

  it("the empty item list offers a button that (re-)focuses the search input", () => {
    render(
      <POItemBuilder
        poType="immediate"
        products={[product]}
        items={[]}
        onItemsChange={vi.fn()}
        onOpenAddProduct={vi.fn()}
      />,
    );

    const input = screen.getByPlaceholderText("Search item by name, SKU or barcode") as HTMLInputElement;
    input.blur();
    expect(document.activeElement).not.toBe(input);

    const button = screen.getByRole("button", { name: /search for an item/i });
    button.click();

    expect(document.activeElement).toBe(input);
  });
});
