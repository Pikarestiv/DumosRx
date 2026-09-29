import { describe, it, expect, vi, beforeEach } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import React, { act } from "react";
import { POItemBuilder } from "@/components/procurement/po-item-builder";
import { addOrMergeLineItem } from "@/components/procurement/po-line-item-math";
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

const toastSuccess = vi.fn();
const toastError = vi.fn();
vi.mock("sonner", () => ({
  toast: {
    success: (...args: unknown[]) => toastSuccess(...args),
    error: (...args: unknown[]) => toastError(...args),
  },
}));
vi.mock("@/lib/hooks/use-product-list", () => ({
  useProductList: () => ({ data: [] }),
}));
vi.mock("@/lib/context/store-context", () => ({
  useStore: () => ({ storeProfile: { store_type: "pharmacy" } }),
}));

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

const second: POProduct = { ...product, id: "p2", name: "Zyrtec" };

function line(overrides: Partial<POLineItemDraft> = {}): POLineItemDraft {
  return {
    product_id: "p1",
    product_name: "Panadol",
    bulk_unit: "Carton",
    bulk_quantity: 1,
    units_per_bulk: 100,
    unit_cost: 400,
    subtotal: 400,
    ...overrides,
  };
}

/**
 * Picking the same product twice appended a second, duplicate row instead of
 * bumping the quantity of the one already on the order - two rows for one
 * product then had to be reconciled by hand. And deleting a row was an
 * unlabelled icon with no way back if it was the wrong one.
 */
describe("addOrMergeLineItem", () => {
  it("appends a row for a product that is not on the order yet", () => {
    const result = addOrMergeLineItem([], product);
    expect(result.merged).toBe(false);
    expect(result.items).toHaveLength(1);
    expect(result.items[0].product_id).toBe("p1");
    expect(result.items[0].bulk_quantity).toBe(1);
  });

  it("increments the existing row instead of duplicating it", () => {
    const result = addOrMergeLineItem([line({ bulk_quantity: 3 })], product);
    expect(result.merged).toBe(true);
    expect(result.items).toHaveLength(1);
    expect(result.items[0].bulk_quantity).toBe(4);
  });

  it("keeps the existing row's own overrides when merging", () => {
    const result = addOrMergeLineItem(
      [line({ bulk_quantity: 1, cost_price_override: 5, lot_number: "B-1" })],
      product,
    );
    expect(result.items[0].cost_price_override).toBe(5);
    expect(result.items[0].lot_number).toBe("B-1");
  });

  it("only merges the matching product, leaving other rows untouched", () => {
    const items = [line(), line({ product_id: "p2", product_name: "Zyrtec" })];
    const result = addOrMergeLineItem(items, second);
    expect(result.items).toHaveLength(2);
    expect(result.items[0].bulk_quantity).toBe(1);
    expect(result.items[1].bulk_quantity).toBe(2);
  });

  it("derives a new row's per-bulk cost from the product's per-base-unit cost", () => {
    const result = addOrMergeLineItem([], product);
    expect(result.items[0].unit_cost).toBe(400);
    expect(result.items[0].units_per_bulk).toBe(100);
  });
});

describe("POItemBuilder list editing", () => {
  beforeEach(() => {
    toastSuccess.mockClear();
    toastError.mockClear();
  });

  function renderBuilder(items: POLineItemDraft[], onItemsChange = vi.fn()) {
    render(
      <POItemBuilder
        poType="immediate"
        products={[product, second]}
        items={items}
        onItemsChange={onItemsChange}
        onOpenAddProduct={vi.fn()}
      />,
    );
    return onItemsChange;
  }

  it("names the delete control after the item it removes", () => {
    renderBuilder([line()]);
    expect(screen.getByRole("button", { name: "Remove Panadol" })).toBeTruthy();
  });

  it("offers an Undo action that puts the removed item back at its original index", () => {
    // Stateful harness: Undo reinserts into whatever the order holds at the
    // moment it is pressed, so the parent has to actually apply the removal
    // first for this to mean anything.
    const seen: POLineItemDraft[][] = [];
    function Harness() {
      const [current, setCurrent] = React.useState<POLineItemDraft[]>([
        line({ product_id: "p0", product_name: "Aspirin" }),
        line(),
        line({ product_id: "p2", product_name: "Zyrtec" }),
      ]);
      seen.push(current);
      return (
        <POItemBuilder
          poType="immediate"
          products={[product, second]}
          items={current}
          onItemsChange={setCurrent}
          onOpenAddProduct={vi.fn()}
        />
      );
    }

    render(<Harness />);

    act(() => {
      screen.getByRole("button", { name: "Remove Panadol" }).click();
    });

    expect(seen[seen.length - 1].map((i) => i.product_name)).toEqual([
      "Aspirin",
      "Zyrtec",
    ]);

    expect(toastSuccess).toHaveBeenCalledTimes(1);
    const options = toastSuccess.mock.calls[0][1] as {
      action?: { label: string; onClick: () => void };
    };
    expect(options.action?.label).toBe("Undo");

    act(() => {
      options.action!.onClick();
    });
    expect(seen[seen.length - 1].map((i) => i.product_name)).toEqual([
      "Aspirin",
      "Panadol",
      "Zyrtec",
    ]);
  });

  it("filters the displayed rows by name without touching the underlying items", () => {
    const onItemsChange = renderBuilder([
      line(),
      line({ product_id: "p2", product_name: "Zyrtec" }),
    ]);

    expect(screen.queryByText("Zyrtec")).not.toBeNull();

    fireEvent.change(screen.getByPlaceholderText("Filter items in this order"), {
      target: { value: "pana" },
    });

    expect(screen.queryByText("Zyrtec")).toBeNull();
    expect(screen.queryByText("Panadol")).not.toBeNull();
    expect(onItemsChange).not.toHaveBeenCalled();
  });

  it("still removes the right item when the list is filtered", () => {
    const onItemsChange = renderBuilder([
      line({ product_id: "p2", product_name: "Zyrtec" }),
      line(),
    ]);

    fireEvent.change(screen.getByPlaceholderText("Filter items in this order"), {
      target: { value: "pana" },
    });

    act(() => {
      screen.getByRole("button", { name: "Remove Panadol" }).click();
    });

    const afterRemove = onItemsChange.mock.calls[0][0] as POLineItemDraft[];
    expect(afterRemove.map((i) => i.product_name)).toEqual(["Zyrtec"]);
  });
});
