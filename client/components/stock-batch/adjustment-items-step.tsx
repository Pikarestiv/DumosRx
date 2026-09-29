"use client";

import { useMemo, useState } from "react";
import { Search, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useUppercaseDisplayClass } from "@/lib/hooks/use-uppercase-display";
import {
  computeStockAfter,
  resolveAdjustmentDelta,
  type AdjustmentReasonValue,
} from "./adjustment-derivations";
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

const MAX_RESULTS = 8;

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
  const capsClass = useUppercaseDisplayClass();
  const [search, setSearch] = useState("");

  const added = useMemo(
    () => new Set(items.map((item) => item.productId)),
    [items],
  );

  // Substring rather than fuzzy matching: a scanned barcode is an exact
  // string and must land on exactly one product.
  const results = useMemo(() => {
    const term = search.trim().toLowerCase();
    if (!term) return [];
    return products
      .filter((product) => {
        if (added.has(product.id)) return false;
        return [product.name, product.barcode, product.generic_name].some((field) =>
          field?.toLowerCase().includes(term),
        );
      })
      .slice(0, MAX_RESULTS);
  }, [search, products, added]);

  return (
    <div className="animate-in fade-in slide-in-from-right-4 duration-300 space-y-4">
      <div>
        <div className="text-[17px] font-semibold mb-1.5">Items to adjust</div>
        <div className="text-[13px] text-muted-foreground">
          Add each item this adjustment affects and enter the quantity.
        </div>
      </div>

      <div className="relative">
        <div className="flex items-center gap-2 bg-muted/30 border border-border rounded-[10px] px-3.5 py-2.5">
          <Search className="w-4 h-4 text-muted-foreground/70 shrink-0" />
          <input
            type="text"
            aria-label="Search products"
            placeholder="Search by name, SKU or barcode"
            className="border-0 outline-none text-[13px] w-full bg-transparent"
            value={search}
            onChange={(event) => setSearch(event.target.value)}
          />
        </div>

        {results.length > 0 && (
          <ul className="mt-2 bg-card border border-border rounded-xl divide-y divide-border overflow-hidden">
            {results.map((product) => (
              <li key={product.id}>
                <button
                  type="button"
                  data-testid={`adjustment-search-result-${product.id}`}
                  onClick={() => {
                    onAdd(product);
                    setSearch("");
                  }}
                  className="w-full text-left px-4 py-2.5 hover:bg-muted/40"
                >
                  <div className={`text-[13.5px] font-semibold ${capsClass}`}>
                    {product.name}
                  </div>
                  <div className="text-[12px] text-muted-foreground/70">
                    {product.barcode || "No SKU"} · {product.stock_quantity || 0} in stock
                  </div>
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>

      {items.length === 0 && (
        <div className="p-6 bg-card border border-border rounded-2xl text-center text-[13px] text-muted-foreground">
          No items added yet. Search above to add the first one.
        </div>
      )}

      {items.length > 0 && (
        <div className="bg-card border border-border rounded-2xl divide-y divide-border">
          {items.map((item) => {
            const delta = resolveAdjustmentDelta(reason, item.quantity);
            return (
              <div
                key={item.productId}
                data-testid={`adjustment-item-${item.productId}`}
                className="p-4 flex flex-wrap items-center justify-between gap-3"
              >
                <div className="min-w-0">
                  <div className={`text-[14px] font-semibold text-foreground ${capsClass}`}>
                    {item.name}
                  </div>
                  <div className="text-[12px] text-muted-foreground/70">{item.sku}</div>
                </div>

                <div className="flex items-center gap-4">
                  <div className="text-center">
                    <div className="text-[11px] text-muted-foreground font-semibold uppercase">
                      Current
                    </div>
                    <div data-testid="current-stock" className="text-[14px] font-bold">
                      {item.currentStock}
                    </div>
                  </div>

                  <div className="text-center">
                    <label
                      htmlFor={`adjustment-qty-${item.productId}`}
                      className="text-[11px] text-muted-foreground font-semibold uppercase block"
                    >
                      Quantity
                    </label>
                    <input
                      id={`adjustment-qty-${item.productId}`}
                      type="number"
                      inputMode="numeric"
                      value={item.quantity}
                      onChange={(event) =>
                        onChangeQuantity(item.productId, Number(event.target.value) || 0)
                      }
                      className="w-20 text-center text-[14px] font-semibold bg-muted/30 border border-border rounded-lg px-2 py-1"
                    />
                  </div>

                  <div className="text-center">
                    <div className="text-[11px] text-muted-foreground font-semibold uppercase">
                      Stock after
                    </div>
                    <div data-testid="stock-after" className="text-[14px] font-bold">
                      {computeStockAfter(item.currentStock, delta)}
                    </div>
                  </div>

                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    aria-label={`Remove ${item.name}`}
                    onClick={() => onRemove(item.productId)}
                  >
                    <X className="w-4 h-4" />
                  </Button>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
