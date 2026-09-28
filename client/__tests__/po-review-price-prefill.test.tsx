import { describe, it, expect, vi, afterEach } from "vitest";
import React, { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { POItemLedgerTable, type POLineItemDraft } from "@/components/procurement/po-item-ledger-table";
import type { POProduct } from "@/lib/db/queries/procurement";

/**
 * The "Review price" popover previously always showed a blank Sell Price
 * input (placeholder "0.00") regardless of the product's actual current
 * selling price, forcing the user to look it up elsewhere before deciding
 * whether to change it. It should be prefilled with the product's current
 * selling price so the user can see - and edit from - what's already on
 * file, without that prefill silently becoming a "change" if left untouched
 * (an untouched field must not override the product's price on submit).
 */
describe("POReviewPricePopover prefill via POItemLedgerTable", () => {
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

  const baseItem: POLineItemDraft = {
    product_id: "p1",
    product_name: "Panadol",
    bulk_unit: "Carton",
    bulk_quantity: 1,
    units_per_bulk: 100,
    unit_cost: 400,
    subtotal: 400,
  };

  afterEach(() => {
    // Radix Popover portals its content directly onto document.body,
    // separate from the test's own container - clear anything left behind
    // so a later test's querySelectorAll('input[type="number"]') can't
    // accidentally pick up a stray node from a previous test.
    document.body.innerHTML = "";
  });

  function renderTable(items: POLineItemDraft[], productOverride: POProduct = product) {
    const container = document.createElement("div");
    document.body.appendChild(container);
    const root: Root = createRoot(container);
    act(() => {
      root.render(
        React.createElement(POItemLedgerTable, {
          poType: "immediate",
          items,
          products: [productOverride],
          onUpdateItem: vi.fn(),
          onRemoveItem: vi.fn(),
        }),
      );
    });
    return { container, root };
  }

  /** The trigger reads "Review price" until the line is repriced, and shows
   * the new price itself afterwards - match on its accessible name, which
   * stays stable either way. */
  function findReviewPriceTrigger(container: HTMLElement): HTMLButtonElement {
    const trigger = Array.from(container.querySelectorAll("button")).find((b) =>
      /price/i.test(b.getAttribute("aria-label") || ""),
    );
    expect(trigger).toBeTruthy();
    return trigger as HTMLButtonElement;
  }

  function findSellPriceInput(): HTMLInputElement {
    const input = document.querySelector('input[placeholder="0.00"]');
    expect(input).not.toBeNull();
    return input as HTMLInputElement;
  }

  it("prefills the Sell Price input with the product's current selling price when the draft item has no override yet", () => {
    const { container, root } = renderTable([baseItem]);
    try {
      const trigger = findReviewPriceTrigger(container);
      act(() => {
        trigger!.click();
      });

      expect(findSellPriceInput().value).toBe("12.5");
    } finally {
      act(() => root.unmount());
      container.remove();
    }
  });

  it("shows the user's own already-entered override instead of the product's current price", () => {
    const { container, root } = renderTable([{ ...baseItem, selling_price: 20 }]);
    try {
      const trigger = findReviewPriceTrigger(container);
      act(() => {
        trigger!.click();
      });

      expect(findSellPriceInput().value).toBe("20");
    } finally {
      act(() => root.unmount());
      container.remove();
    }
  });

  it("shows blank, not a literal 0, when the product has no selling price on file yet", () => {
    const { container, root } = renderTable([baseItem], { ...product, selling_price: 0 });
    try {
      const trigger = findReviewPriceTrigger(container);
      act(() => {
        trigger!.click();
      });

      expect(findSellPriceInput().value).toBe("");
    } finally {
      act(() => root.unmount());
      container.remove();
    }
  });

  it("does not call onUpdateItem just from the prefill being displayed", () => {
    const onUpdateItem = vi.fn();
    const container = document.createElement("div");
    document.body.appendChild(container);
    const root: Root = createRoot(container);
    try {
      act(() => {
        root.render(
          React.createElement(POItemLedgerTable, {
            poType: "immediate",
            items: [baseItem],
            products: [product],
            onUpdateItem,
            onRemoveItem: vi.fn(),
          }),
        );
      });

      const trigger = findReviewPriceTrigger(container);
      act(() => {
        trigger!.click();
      });

      expect(onUpdateItem).not.toHaveBeenCalled();
    } finally {
      act(() => root.unmount());
      container.remove();
    }
  });
});
