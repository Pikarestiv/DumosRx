"use client";

import { useCallback, useMemo, useRef, useState } from "react";
import { ProductCombobox, type SelectedProduct } from "@/components/ui/product-combobox";
import { useMediaQuery } from "@/hooks/use-media-query";
import { AdjustmentItemsTable } from "./adjustment-items-table";
import { AdjustmentItemsCardList } from "./adjustment-items-card-list";
import { type AdjustmentReasonValue } from "./adjustment-derivations";
import type { ProductWithDetails } from "@/lib/types/product";

export interface AdjustmentDraftItem {
  productId: string;
  name: string;
  sku: string;
  currentStock: number;
  quantity: number;
  unitCost?: number;
}

/** Same read the cycle count uses for an item's "current" figure:
 * getProductsWithDetails()' stock_quantity aggregate over active batches. */
export function toAdjustmentDraftItem(product: ProductWithDetails): AdjustmentDraftItem {
  return {
    productId: product.id,
    name: product.name,
    sku: product.barcode || `SKU-${product.id.substring(0, 6)}`,
    currentStock: product.stock_quantity || 0,
    quantity: 0,
    unitCost: product.cost_price ?? undefined,
  };
}

interface AdjustmentItemsStepProps {
  reason: AdjustmentReasonValue;
  items: AdjustmentDraftItem[];
  products: ProductWithDetails[];
  onAdd: (product: ProductWithDetails) => void;
  onChangeQuantity: (productId: string, quantity: number) => void;
  onRemove: (productId: string) => void;
}

export function AdjustmentItemsStep({
  reason,
  items,
  products,
  onAdd,
  onChangeQuantity,
  onRemove,
}: AdjustmentItemsStepProps) {
  const [search, setSearch] = useState("");
  // Same breakpoint the PO item builder switches its own cart on: below 640px
  // the four columns are too cramped to use even with horizontal scroll.
  const isTabletUp = useMediaQuery("(min-width: 640px)");

  const added = useMemo(
    () => new Set(items.map((item) => item.productId)),
    [items],
  );

  // Rows already in the draft are withheld from the combobox's catalog
  // instead of being filtered out of its results, so picking one can never
  // silently overwrite a quantity that has already been entered.
  const selectableProducts = useMemo(
    () => products.filter((product) => !added.has(product.id)),
    [products, added],
  );

  // Read through refs so the callbacks handed to the memoised rows stay
  // identical across renders, the same way POItemBuilder keeps its own stable.
  const onChangeQuantityRef = useRef(onChangeQuantity);
  onChangeQuantityRef.current = onChangeQuantity;
  const onRemoveRef = useRef(onRemove);
  onRemoveRef.current = onRemove;

  const handleChangeQuantity = useCallback(
    (productId: string, quantity: number) => onChangeQuantityRef.current(productId, quantity),
    [],
  );
  const handleRemove = useCallback(
    (productId: string) => onRemoveRef.current(productId),
    [],
  );

  const handleSelect = (option: SelectedProduct) => {
    if (option.source === "local" && option.localId) {
      const product = products.find((candidate) => candidate.id === option.localId);
      if (product) {
        onAdd(product);
        setSearch("");
        return;
      }
    }
    setSearch(option.name);
  };

  return (
    <div className="animate-in fade-in slide-in-from-right-4 duration-300 space-y-4">
      <div>
        <div className="text-[17px] font-semibold mb-1.5">Items to adjust</div>
        <div className="text-[13px] text-muted-foreground">
          Add each item this adjustment affects and enter the quantity.
        </div>
      </div>

      {/* Same search-to-add-a-row model the PO item builder uses: the row
       * appears the instant a catalog product is picked, with no separate
       * "Add" click. showCreateNewOption is off because an adjustment can
       * only ever move stock that already exists in the catalog. */}
      <ProductCombobox
        value={search}
        onChange={handleSelect}
        onClear={() => setSearch("")}
        showGlobalSuggestions={false}
        showCreateNewOption={false}
        showSearchIcon
        placeholder="Search by name, SKU or barcode"
        className="bg-muted/30 border-border h-10 px-3 text-[13px] rounded-[10px]"
        products={selectableProducts}
      />

      {items.length === 0 && (
        <div className="p-6 bg-card border border-border rounded-2xl text-center text-[13px] text-muted-foreground">
          No items added yet. Search above to add the first one.
        </div>
      )}

      {/* Desktop table vs. phone cards, conditionally rendered rather than
       * CSS-hidden, so only one of the two ever mounts its per-row inputs.
       * Same split, at the same 640px breakpoint, as procurement's
       * POItemBuilder — an adjustment is a handful of explicitly added rows,
       * not the cycle count's bulk sweep of the whole catalog, so it wants
       * the item-builder pattern rather than audit-ledger-step's virtualized
       * grid. */}
      {items.length > 0 &&
        (isTabletUp ? (
          <AdjustmentItemsTable
            reason={reason}
            items={items}
            onChangeQuantity={handleChangeQuantity}
            onRemove={handleRemove}
          />
        ) : (
          <AdjustmentItemsCardList
            reason={reason}
            items={items}
            onChangeQuantity={handleChangeQuantity}
            onRemove={handleRemove}
          />
        ))}
    </div>
  );
}
