"use client";

import { useEffect, useState } from "react";
import { ProductCombobox, SelectedProduct } from "@/components/ui/product-combobox";
import { useMediaQuery } from "@/hooks/use-media-query";
import { POItemLedgerTable, type POLineItemDraft } from "./po-item-ledger-table";
import { POItemCardList } from "./po-item-card-list";
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
  const isTabletUp = useMediaQuery("(min-width: 640px)");

  const addRowForProduct = (product: POProduct) => {
    const newItem: POLineItemDraft = {
      product_id: product.id,
      product_name: product.name,
      bulk_unit: product.bulk_unit || "Carton",
      bulk_quantity: 1,
      units_per_bulk: product.units_per_bulk || 1,
      unit_cost: product.cost_price ? product.cost_price * (product.units_per_bulk || 1) : 0,
      subtotal: product.cost_price ? product.cost_price * (product.units_per_bulk || 1) : 0,
    };
    onItemsChange([...items, newItem]);
    setSearchValue("");
  };

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

  const handleUpdateItem = (index: number, patch: Partial<POLineItemDraft>) => {
    const next = [...items];
    next[index] = { ...next[index], ...patch };
    onItemsChange(next);
  };

  const handleRemoveItem = (index: number) => {
    onItemsChange(items.filter((_, i) => i !== index));
  };

  return (
    <div className="space-y-3">
      <ProductCombobox
        value={searchValue}
        onChange={handleProductChange}
        onCreateNew={(name) => onOpenAddProduct({ name })}
        showGlobalSuggestions={false}
        placeholder="Search item by name, SKU or barcode"
        className="bg-muted border-border h-10 px-3 text-[13px] rounded-[10px]"
        onClear={() => setSearchValue("")}
      />

      {isTabletUp ? (
        <POItemLedgerTable
          poType={poType}
          items={items}
          products={products}
          onUpdateItem={handleUpdateItem}
          onRemoveItem={handleRemoveItem}
        />
      ) : (
        <POItemCardList
          poType={poType}
          items={items}
          products={products}
          onUpdateItem={handleUpdateItem}
          onRemoveItem={handleRemoveItem}
        />
      )}
    </div>
  );
}
