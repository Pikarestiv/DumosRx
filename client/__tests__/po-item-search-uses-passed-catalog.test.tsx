import { describe, it, expect, vi } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";
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

const useProductList = vi.fn((_opts?: { enabled?: boolean }) => ({
  data: [] as unknown[],
}));
vi.mock("@/lib/hooks/use-product-list", () => ({
  useProductList: (opts?: { enabled?: boolean }) => useProductList(opts),
}));
vi.mock("@/lib/context/store-context", () => ({
  useStore: () => ({ storeProfile: { store_type: "pharmacy" } }),
}));
vi.mock("sonner", () => ({ toast: { success: vi.fn(), error: vi.fn() } }));

/**
 * The item search used to run its own full-catalog query, duplicating the one
 * useProcurementData already made. It now searches the list the builder is
 * handed - which only works if that list still carries the fields the search
 * matches on, generic_name in particular.
 */
describe("PO item search over the builder's own catalog", () => {
  const products: POProduct[] = [
    {
      id: "p1",
      name: "Panadol Extra",
      bulk_unit: "Carton",
      base_unit: "Tablet",
      units_per_bulk: 100,
      cost_price: 4,
      stock_quantity: 50,
      selling_price: 12.5,
      generic_name: "Paracetamol",
    },
  ];

  function renderBuilder() {
    render(
      <POItemBuilder
        poType="immediate"
        products={products}
        items={[]}
        onItemsChange={vi.fn()}
        onOpenAddProduct={vi.fn()}
      />,
    );
  }

  it("does not run its own catalog query when handed one", () => {
    useProductList.mockClear();
    renderBuilder();
    expect(useProductList).toHaveBeenCalled();
    expect(useProductList).toHaveBeenCalledWith({ enabled: false });
  });

  it("matches a catalog product by name from the passed-in list", () => {
    renderBuilder();
    fireEvent.change(
      screen.getByPlaceholderText("Search item by name, SKU or barcode"),
      { target: { value: "panadol" } },
    );
    expect(screen.getByRole("listbox").textContent).toContain("Panadol Extra");
  });

  it("still matches a catalog product by its generic name", () => {
    renderBuilder();
    fireEvent.change(
      screen.getByPlaceholderText("Search item by name, SKU or barcode"),
      { target: { value: "paracetamol" } },
    );
    expect(screen.getByRole("listbox").textContent).toContain("Panadol Extra");
  });
});
