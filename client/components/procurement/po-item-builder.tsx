"use client";

import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { Filter, X } from "lucide-react";
import { toast } from "sonner";
import { Input } from "@/components/ui/input";
import { ProductCombobox, SelectedProduct } from "@/components/ui/product-combobox";
import { useMediaQuery } from "@/hooks/use-media-query";
import { POItemLedgerTable, type POLineItemDraft, type POItemRow } from "./po-item-ledger-table";
import { POEditProductDialog } from "./po-edit-product-dialog";
import { POItemCardList } from "./po-item-card-list";
import { addOrMergeLineItem } from "./po-line-item-math";
import type { POProduct } from "@/lib/db/queries/procurement";
import type { ProductViewModel } from "@/lib/types/product";
import { useDisplayName } from "@/lib/hooks/use-uppercase-display";
import { useOutstandingBackorders } from "@/lib/hooks/use-outstanding-backorders";

interface POItemBuilderProps {
  poType: "standard" | "immediate";
  products: POProduct[];
  items: POLineItemDraft[];
  onItemsChange: (items: POLineItemDraft[]) => void;
  onOpenAddProduct: (productData: Partial<ProductViewModel>) => void;
  newlyCreatedProductId?: string | null;
  onNewlyCreatedProductConsumed?: () => void;
  canEditProducts?: boolean;
}

// Search-to-add-a-row bulk item entry, replacing the old one-at-a-time POAddItemForm + separate cart summary.
// Rationale: docs/CLIENT_COMMENTS.md#block-components-procurement-po-item-builder-tsx-L26
export function POItemBuilder({
  poType,
  products,
  items,
  onItemsChange,
  onOpenAddProduct,
  newlyCreatedProductId,
  onNewlyCreatedProductConsumed,
  canEditProducts,
}: POItemBuilderProps) {
  const displayName = useDisplayName();
  const [searchValue, setSearchValue] = useState("");
  const [itemFilter, setItemFilter] = useState("");
  const [editingProductId, setEditingProductId] = useState<string | null>(null);
  const isTabletUp = useMediaQuery("(min-width: 640px)");
  const searchInputRef = useRef<HTMLInputElement>(null);

  const backorders = useOutstandingBackorders();
  const owedByProduct = useMemo(() => {
    const map = new Map<string, number>();
    for (const b of backorders) {
      if (b.outstanding > 0) map.set(b.productId, b.outstanding);
    }
    return map;
  }, [backorders]);

  const productsWithStockInfo = useMemo(() => {
    return products.map((p) => ({
      ...p,
      stock_owed: owedByProduct.get(p.id) ?? 0,
    }));
  }, [products, owedByProduct]);

  // Staff's first instinct on a brand-new order is to start typing an item name right away, not to click into the search bar…
  // Rationale: docs/CLIENT_COMMENTS.md#line-components-procurement-po-item-builder-tsx-L48
  useEffect(() => {
    if (items.length === 0) {
      searchInputRef.current?.focus();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const focusSearch = useCallback(() => searchInputRef.current?.focus(), []);

  const itemsRef = useRef(items);
  const onItemsChangeRef = useRef(onItemsChange);
  useLayoutEffect(() => {
    itemsRef.current = items;
    onItemsChangeRef.current = onItemsChange;
  });

  // Reading the current items through a ref keeps them out of every handler's dependency list, so the callbacks handed to th…
  // Rationale: docs/CLIENT_COMMENTS.md#line-components-procurement-po-item-builder-tsx-L68
  const updateItems = useCallback(
    (mutate: (current: POLineItemDraft[]) => POLineItemDraft[]) => {
      onItemsChangeRef.current(mutate(itemsRef.current));
    },
    [],
  );

  const appendProductRow = useCallback(
    (product: POProduct) => {
      const { items: next, merged } = addOrMergeLineItem(
        itemsRef.current,
        product,
      );
      onItemsChangeRef.current(next);
      if (merged) {
        toast.success(`${displayName(product.name)} is already on this order`);
      }
    },
    [displayName],
  );

  const handleProductChange = (option: SelectedProduct) => {
    if (option.source === "local" && option.localId) {
      const product = products.find((p) => p.id === option.localId);
      if (product) {
        appendProductRow(product);
        setSearchValue("");
        return;
      }
    }
    setSearchValue(option.name);
  };

  const createdProduct = newlyCreatedProductId
    ? products.find((p) => p.id === newlyCreatedProductId)
    : undefined;
  const [searchClearedForId, setSearchClearedForId] = useState<string | null>(null);
  if (createdProduct && createdProduct.id !== searchClearedForId) {
    setSearchClearedForId(createdProduct.id);
    setSearchValue("");
  }

  useEffect(() => {
    if (!createdProduct) return;
    appendProductRow(createdProduct);
    onNewlyCreatedProductConsumed?.();
  }, [createdProduct, appendProductRow, onNewlyCreatedProductConsumed]);

  const handleUpdateItem = useCallback(
    (index: number, patch: Partial<POLineItemDraft>) => {
      updateItems((current) =>
        current.map((item, i) => (i === index ? { ...item, ...patch } : item)),
      );
    },
    [updateItems],
  );

  const handleProductRenamed = useCallback(
    (productId: string, name: string) =>
      updateItems((current) =>
        current.map((item) => (item.product_id === productId ? { ...item, product_name: name } : item)),
      ),
    [updateItems],
  );

  const handleRemoveItem = useCallback(
    (index: number) => {
      const removed = itemsRef.current[index];
      if (!removed) return;
      updateItems((current) => current.filter((_, i) => i !== index));
      toast.success(`${displayName(removed.product_name)} removed`, {
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
    [updateItems, displayName],
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
        products={productsWithStockInfo}
      />

      {items.length > 1 && (
        <div className="relative">
          <Filter className="absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground pointer-events-none" />
          <Input
            value={itemFilter}
            onChange={(e) => setItemFilter(e.target.value)}
            placeholder="Search items in this purchase order"
            aria-label="Search items in this purchase order"
            className="pl-9 pr-9 h-9 text-[12.5px] rounded-[10px]"
          />
          {itemFilter && (
            <button
              type="button"
              aria-label="Clear filter"
              onClick={() => setItemFilter("")}
              className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
            >
              <X className="h-4 w-4" />
            </button>
          )}
        </div>
      )}

      {isTabletUp ? (
        <POItemLedgerTable
          poType={poType}
          rows={visibleRows}
          products={products}
          onUpdateItem={handleUpdateItem}
          onRemoveItem={handleRemoveItem}
          onEditProduct={canEditProducts ? setEditingProductId : undefined}
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
          onEditProduct={canEditProducts ? setEditingProductId : undefined}
          onFocusSearch={focusSearch}
          isFiltered={itemFilter.trim().length > 0}
        />
      )}

      {editingProductId && (
        <POEditProductDialog
          productId={editingProductId}
          onClose={() => setEditingProductId(null)}
          onRenamed={handleProductRenamed}
        />
      )}
    </div>
  );
}
