"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Filter } from "lucide-react";
import { toast } from "sonner";
import { Input } from "@/components/ui/input";
import { ProductCombobox, SelectedProduct } from "@/components/ui/product-combobox";
import { useMediaQuery } from "@/hooks/use-media-query";
import { POItemLedgerTable, type POLineItemDraft, type POItemRow } from "./po-item-ledger-table";
import { POItemCardList } from "./po-item-card-list";
import { addOrMergeLineItem } from "./po-line-item-math";
import type { POProduct } from "@/lib/db/queries/procurement";
import type { ProductViewModel } from "@/lib/types/product";

interface POItemBuilderProps {
  poType: "standard" | "immediate";
  products: POProduct[];
  items: POLineItemDraft[];
  onItemsChange: (items: POLineItemDraft[]) => void;
  onOpenAddProduct: (productData: Partial<ProductViewModel>) => void;
  newlyCreatedProductId?: string | null;
  onNewlyCreatedProductConsumed?: () => void;
}

/** Search-to-add-a-row bulk item entry, replacing the old one-at-a-time
 * POAddItemForm + separate cart summary. A row is added the moment a
 * catalog product is picked (or a newly created product comes back); no
 * separate "Add" click is needed to commit it to the list, since it's
 * already in the list. showGlobalSuggestions={false} on the combobox keeps
 * catalog matches and non-catalog name suggestions from ever appearing in
 * the same dropdown. */
export function POItemBuilder({
  poType,
  products,
  items,
  onItemsChange,
  onOpenAddProduct,
  newlyCreatedProductId,
  onNewlyCreatedProductConsumed,
}: POItemBuilderProps) {
  const [searchValue, setSearchValue] = useState("");
  const [itemFilter, setItemFilter] = useState("");
  const isTabletUp = useMediaQuery("(min-width: 640px)");
  const searchInputRef = useRef<HTMLInputElement>(null);

  // Staff's first instinct on a brand-new order is to start typing an item
  // name right away, not to click into the search bar first - but this same
  // component also mounts on the edit page resuming an existing draft,
  // where the order already has items and grabbing focus (popping the
  // mobile keyboard) would cover the very rows the user came to edit.
  // Only mount-focus when there's nothing in the order yet.
  useEffect(() => {
    if (items.length === 0) {
      searchInputRef.current?.focus();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const focusSearch = useCallback(() => searchInputRef.current?.focus(), []);

  const itemsRef = useRef(items);
  itemsRef.current = items;
  const onItemsChangeRef = useRef(onItemsChange);
  onItemsChangeRef.current = onItemsChange;

  // Reading the current items through a ref keeps them out of every
  // handler's dependency list, so the callbacks handed to the memoised rows
  // stay identical across renders and editing one line does not re-render
  // every other line's inputs, date pickers and popovers.
  const updateItems = useCallback(
    (mutate: (current: POLineItemDraft[]) => POLineItemDraft[]) => {
      onItemsChangeRef.current(mutate(itemsRef.current));
    },
    [],
  );

  const addRowForProduct = useCallback(
    (product: POProduct) => {
      const { items: next, merged } = addOrMergeLineItem(
        itemsRef.current,
        product,
      );
      onItemsChangeRef.current(next);
      setSearchValue("");
      if (merged) {
        toast.success(`Quantity increased for ${product.name}`);
      }
    },
    [],
  );

  const handleProductChange = (option: SelectedProduct) => {
    if (option.source === "local" && option.localId) {
      const product = products.find((p) => p.id === option.localId);
      if (product) {
        addRowForProduct(product);
        return;
      }
    }
    setSearchValue(option.name);
  };

  // Auto-add a row once the "Add as new product" -> AddProductDialog round
  // trip resolves and the new product shows up in the catalog list.
  useEffect(() => {
    if (newlyCreatedProductId && products.length > 0) {
      const created = products.find((p) => p.id === newlyCreatedProductId);
      if (created) {
        addRowForProduct(created);
        onNewlyCreatedProductConsumed?.();
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [products, newlyCreatedProductId, onNewlyCreatedProductConsumed]);

  const handleUpdateItem = useCallback(
    (index: number, patch: Partial<POLineItemDraft>) => {
      updateItems((current) =>
        current.map((item, i) => (i === index ? { ...item, ...patch } : item)),
      );
    },
    [updateItems],
  );

  const handleRemoveItem = useCallback(
    (index: number) => {
      const removed = itemsRef.current[index];
      if (!removed) return;
      updateItems((current) => current.filter((_, i) => i !== index));
      toast.success(`${removed.product_name} removed`, {
        action: {
          label: "Undo",
          onClick: () =>
            updateItems((current) => {
              const restored = [...current];
              restored.splice(index, 0, removed);
              return restored;
            }),
        },
      });
    },
    [updateItems],
  );

  // Display-only: never narrows the order itself, only which of its rows are
  // on screen, so a 50-line order can be worked through without horizontal
  // scrolling past everything else. Rows carry their real index so an edit
  // or a delete still lands on the right line while filtered.
  const visibleRows = useMemo<POItemRow[]>(() => {
    const query = itemFilter.trim().toLowerCase();
    const rows = items.map((item, index) => ({ item, index }));
    if (!query) return rows;
    return rows.filter(({ item }) =>
      item.product_name.toLowerCase().includes(query),
    );
  }, [items, itemFilter]);

  return (
    <div className="space-y-3">
      <ProductCombobox
        value={searchValue}
        onChange={handleProductChange}
        onCreateNew={(name) => onOpenAddProduct({ name })}
        showGlobalSuggestions={false}
        showSearchIcon
        placeholder="Search item by name, SKU or barcode"
        className="bg-muted border-border h-10 px-3 text-[13px] rounded-[10px]"
        onClear={() => setSearchValue("")}
        inputRef={searchInputRef}
        products={products}
      />

      {items.length > 1 && (
        <div className="relative">
          <Filter className="absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground pointer-events-none" />
          <Input
            value={itemFilter}
            onChange={(e) => setItemFilter(e.target.value)}
            placeholder="Filter items in this order"
            aria-label="Filter items in this order"
            className="pl-9 h-9 text-[12.5px] rounded-[10px]"
          />
        </div>
      )}

      {isTabletUp ? (
        <POItemLedgerTable
          poType={poType}
          rows={visibleRows}
          products={products}
          onUpdateItem={handleUpdateItem}
          onRemoveItem={handleRemoveItem}
          onFocusSearch={focusSearch}
          isFiltered={itemFilter.trim().length > 0}
        />
      ) : (
        <POItemCardList
          poType={poType}
          rows={visibleRows}
          products={products}
          onUpdateItem={handleUpdateItem}
          onRemoveItem={handleRemoveItem}
          onFocusSearch={focusSearch}
          isFiltered={itemFilter.trim().length > 0}
        />
      )}
    </div>
  );
}
