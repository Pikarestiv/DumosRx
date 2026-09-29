"use client";

import React, { useMemo } from "react";
import { Trash2, Search } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { DatePickerInput } from "@/components/ui/date-picker-input";
import { EditableNumberCell } from "@/components/ui/editable-number-cell";
import { POReviewPricePopover } from "./po-review-price-popover";
import { clampMoneyInput, getImmediateUnitCost, getLineTotal } from "./po-line-item-math";
import { formatCurrency } from "@/lib/utils";
import type { POProduct } from "@/lib/db/queries/procurement";

export interface POLineItemDraft {
  product_id: string;
  product_name: string;
  bulk_unit: string;
  bulk_quantity: number;
  units_per_bulk: number;
  unit_cost: number;
  subtotal: number;
  cost_price_override?: number | string;
  lot_number?: string;
  expiry_date?: string;
  selling_price?: number | string;
}

/** A line paired with its index in the order's real item array. The lists
 * render a possibly-filtered subset, so a row cannot infer which line it
 * edits from its own position on screen. */
export interface POItemRow {
  item: POLineItemDraft;
  index: number;
}

interface POItemLedgerTableProps {
  poType: "standard" | "immediate";
  rows: POItemRow[];
  products: POProduct[];
  onUpdateItem: (index: number, patch: Partial<POLineItemDraft>) => void;
  onRemoveItem: (index: number) => void;
  onFocusSearch?: () => void;
  isFiltered?: boolean;
}

const STANDARD_GRID_COLS = "grid-cols-[1fr_110px_130px_130px_36px]";
const IMMEDIATE_GRID_COLS = "grid-cols-[1fr_90px_100px_110px_120px_120px_130px_120px_130px_36px]";

/** Keyed by product id once per render instead of a products.find() per row:
 * that scan was O(rows x catalog) on every keystroke in any row's input. */
export function useProductMap(products: POProduct[]) {
  return useMemo(() => new Map(products.map((p) => [p.id, p])), [products]);
}

/** Memoised so editing one line's quantity re-renders that line only, not
 * every other line's inputs, date picker and price popover. Its props are
 * primitives, the row's own objects, or callbacks POItemBuilder keeps stable
 * with useCallback. */
const POItemLedgerRow = React.memo(function POItemLedgerRow({
  item,
  index,
  product,
  poType,
  gridCols,
  onUpdateItem,
  onRemoveItem,
}: {
  item: POLineItemDraft;
  index: number;
  product: POProduct | undefined;
  poType: "standard" | "immediate";
  gridCols: string;
  onUpdateItem: (index: number, patch: Partial<POLineItemDraft>) => void;
  onRemoveItem: (index: number) => void;
}) {
  const currentCost = product?.cost_price ?? 0;
  const stock = product?.stock_quantity ?? 0;
  const effectiveUnitCost = getImmediateUnitCost(item);
  const total = getLineTotal(item, poType);

  return (
    <div role="row" className={`grid ${gridCols} items-center`}>
      <div role="cell" className="px-3 py-2 sticky left-0 bg-card">
        <div className="font-semibold text-foreground truncate max-w-[200px]">
          {item.product_name}
        </div>
        <div className="text-[11px] text-muted-foreground/70">{item.bulk_unit}(s)</div>
      </div>

      {poType === "immediate" && (
        <div role="cell" className="px-3 py-2 text-right text-muted-foreground">
          {stock}
        </div>
      )}

      <div role="cell" className="px-3 py-2 flex justify-end">
        <EditableNumberCell
          value={item.bulk_quantity}
          onCommit={(val) => onUpdateItem(index, { bulk_quantity: val })}
          parse={(raw) => parseInt(raw, 10)}
          min={0}
          widthClassName="w-16"
          ariaLabel={`${poType === "immediate" ? "Received" : "Quantity"} for ${item.product_name}`}
        />
      </div>

      {poType === "immediate" && (
        <div role="cell" className="px-3 py-2 text-right text-muted-foreground">
          {formatCurrency(currentCost)}
        </div>
      )}

      <div role="cell" className="px-3 py-2 flex justify-end">
        {poType === "immediate" ? (
          <Input
            type="number"
            min={0}
            step="0.01"
            className="w-24 text-right"
            aria-label={`New Cost for ${item.product_name}`}
            placeholder={formatCurrency(currentCost)}
            value={item.cost_price_override ?? ""}
            onChange={(e) =>
              onUpdateItem(index, {
                cost_price_override: clampMoneyInput(e.target.value),
              })
            }
          />
        ) : (
          <EditableNumberCell
            value={item.unit_cost}
            onCommit={(val) => onUpdateItem(index, { unit_cost: val, subtotal: item.bulk_quantity * val })}
            parse={parseFloat}
            min={0}
            step="0.01"
            widthClassName="w-24"
            ariaLabel={`Unit Cost for ${item.product_name}`}
          />
        )}
      </div>

      {poType === "immediate" && (
        <>
          <div role="cell" className="px-3 py-2">
            <Input
              className="min-w-24"
              aria-label={`Lot or batch number for ${item.product_name}`}
              placeholder="e.g. BATCH-123"
              value={item.lot_number || ""}
              onChange={(e) => onUpdateItem(index, { lot_number: e.target.value })}
            />
          </div>
          <div role="cell" className="px-3 py-2">
            <DatePickerInput
              value={item.expiry_date}
              onChange={(val) => onUpdateItem(index, { expiry_date: val })}
              ariaLabel={`Expiry date for ${item.product_name}`}
              placeholder="Select"
              disablePast
              fromYear={new Date().getFullYear()}
              toYear={new Date().getFullYear() + 15}
            />
          </div>
        </>
      )}

      <div role="cell" className="px-3 py-2 text-right font-semibold text-foreground">
        {formatCurrency(total)}
      </div>

      {poType === "immediate" && (
        <div role="cell" className="px-3 py-2 flex justify-end">
          <POReviewPricePopover
            costPrice={effectiveUnitCost}
            sellingPrice={item.selling_price ?? (product?.selling_price || "")}
            currentSellingPrice={product?.selling_price ?? null}
            productName={item.product_name}
            onSellingPriceChange={(val) => onUpdateItem(index, { selling_price: val })}
          />
        </div>
      )}

      <div role="cell" className="px-3 py-2 flex justify-end">
        <Button
          type="button"
          variant="ghost"
          size="icon"
          aria-label={`Remove ${item.product_name}`}
          className="h-7 w-7 text-muted-foreground hover:text-destructive"
          onClick={() => onRemoveItem(index)}
        >
          <Trash2 className="w-3.5 h-3.5" />
        </Button>
      </div>
    </div>
  );
});

/** Bulk item-entry table shared by Standard and Immediate Purchase orders.
 * Column set depends on poType: Standard only needs qty/cost (nothing is
 * received yet), Immediate needs the full receiving surface (current cost,
 * new cost, batch, expiry, sell-price review) so order + receipt can happen
 * in one pass. Built on the same div/ARIA-table conventions as
 * receive-ledger-table.tsx. */
export function POItemLedgerTable({
  poType,
  rows,
  products,
  onUpdateItem,
  onRemoveItem,
  onFocusSearch,
  isFiltered,
}: POItemLedgerTableProps) {
  const gridCols = poType === "immediate" ? IMMEDIATE_GRID_COLS : STANDARD_GRID_COLS;
  const productMap = useProductMap(products);

  return (
    <div className="border border-border rounded-xl overflow-x-auto">
      <div role="table" aria-label="Order items" className="w-full text-[12.5px]">
        <div role="rowgroup">
          <div role="row" className={`grid ${gridCols} bg-muted/40 text-muted-foreground text-[11px] uppercase font-semibold`}>
            <div role="columnheader" className="text-left px-3 py-2 sticky left-0 bg-muted/40">Item</div>
            {poType === "immediate" && (
              <div
                role="columnheader"
                className="text-right px-3 py-2"
                title="Quantity currently on hand, before this order is received"
              >
                Stock
              </div>
            )}
            <div role="columnheader" className="text-right px-3 py-2">
              {poType === "immediate" ? "Received" : "Qty"}
            </div>
            {poType === "immediate" && (
              <div
                role="columnheader"
                className="text-right px-3 py-2"
                title="The product's cost price on file before this order - for comparison only, not editable here"
              >
                Current Cost
              </div>
            )}
            <div
              role="columnheader"
              className="text-right px-3 py-2"
              title={
                poType === "immediate"
                  ? "The cost you're actually paying this time - leave blank to keep using the product's current cost"
                  : undefined
              }
            >
              {poType === "immediate" ? "New Cost" : "Unit Cost"}
            </div>
            {poType === "immediate" && (
              <>
                <div role="columnheader" className="text-left px-3 py-2">Lot/Batch</div>
                <div role="columnheader" className="text-left px-3 py-2">Expiry</div>
              </>
            )}
            <div role="columnheader" className="text-right px-3 py-2">
              {poType === "immediate" ? "Total" : "Subtotal"}
            </div>
            {poType === "immediate" && (
              <div
                role="columnheader"
                className="text-right px-3 py-2"
                title="Updates the product's selling price store-wide once this order is received - leave blank to keep the current price"
              >
                Sell Price
              </div>
            )}
            <div role="columnheader" />
          </div>
        </div>

        <div role="rowgroup" className="divide-y divide-border">
          {rows.map(({ item, index }) => (
            <POItemLedgerRow
              key={`${item.product_id}_${index}`}
              item={item}
              index={index}
              product={productMap.get(item.product_id)}
              poType={poType}
              gridCols={gridCols}
              onUpdateItem={onUpdateItem}
              onRemoveItem={onRemoveItem}
            />
          ))}
          {rows.length === 0 && (
            <div role="row" className={`grid ${gridCols}`}>
              <div role="cell" className="col-span-full">
                {isFiltered ? (
                  <EmptyState
                    icon={Search}
                    title="No items on this order match that filter"
                    className="py-8"
                  />
                ) : (
                  <EmptyState
                    icon={Search}
                    title="Search above to add items to this order"
                    className="py-8"
                    action={onFocusSearch ? { label: "Search for an item", icon: Search, onClick: onFocusSearch } : undefined}
                  />
                )}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
