"use client";

import { Trash2 } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { DatePickerInput } from "@/components/ui/date-picker-input";
import { EditableNumberCell } from "@/components/ui/editable-number-cell";
import { POReviewPricePopover } from "./po-review-price-popover";
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

interface POItemLedgerTableProps {
  poType: "standard" | "immediate";
  items: POLineItemDraft[];
  products: POProduct[];
  onUpdateItem: (index: number, patch: Partial<POLineItemDraft>) => void;
  onRemoveItem: (index: number) => void;
}

const STANDARD_GRID_COLS = "grid-cols-[1fr_110px_130px_130px_36px]";
const IMMEDIATE_GRID_COLS = "grid-cols-[1fr_90px_100px_110px_120px_120px_130px_120px_130px_36px]";

/** Bulk item-entry table shared by Standard and Immediate Purchase orders.
 * Column set depends on poType: Standard only needs qty/cost (nothing is
 * received yet), Immediate needs the full receiving surface (current cost,
 * new cost, batch, expiry, sell-price review) so order + receipt can happen
 * in one pass. Built on the same div/ARIA-table conventions as
 * receive-ledger-table.tsx. */
export function POItemLedgerTable({
  poType,
  items,
  products,
  onUpdateItem,
  onRemoveItem,
}: POItemLedgerTableProps) {
  const gridCols = poType === "immediate" ? IMMEDIATE_GRID_COLS : STANDARD_GRID_COLS;

  return (
    <div className="border border-border rounded-xl overflow-x-auto">
      <div role="table" aria-label="Order items" className="w-full text-[12.5px]">
        <div role="rowgroup">
          <div role="row" className={`grid ${gridCols} bg-muted/40 text-muted-foreground text-[11px] uppercase font-semibold`}>
            <div role="columnheader" className="text-left px-3 py-2 sticky left-0 bg-muted/40">Item</div>
            {poType === "immediate" && (
              <div role="columnheader" className="text-right px-3 py-2">Stock</div>
            )}
            <div role="columnheader" className="text-right px-3 py-2">
              {poType === "immediate" ? "Received" : "Qty"}
            </div>
            {poType === "immediate" && (
              <div role="columnheader" className="text-right px-3 py-2">Current Cost</div>
            )}
            <div role="columnheader" className="text-right px-3 py-2">
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
              <div role="columnheader" className="text-right px-3 py-2">Sell Price</div>
            )}
            <div role="columnheader" />
          </div>
        </div>

        <div role="rowgroup" className="divide-y divide-border">
          {items.map((item, index) => {
            const product = products.find((p) => p.id === item.product_id);
            const currentCost = product?.cost_price ?? 0;
            const stock = product?.stock_quantity ?? 0;
            const effectiveCost =
              item.cost_price_override !== undefined && item.cost_price_override !== ""
                ? Number(item.cost_price_override)
                : item.unit_cost;
            const total = item.bulk_quantity * (poType === "immediate" ? effectiveCost : item.unit_cost);

            return (
              <div key={`${item.product_id}_${index}`} role="row" className={`grid ${gridCols} items-center`}>
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
                      placeholder={formatCurrency(currentCost)}
                      value={item.cost_price_override ?? ""}
                      onChange={(e) => onUpdateItem(index, { cost_price_override: e.target.value })}
                    />
                  ) : (
                    <EditableNumberCell
                      value={item.unit_cost}
                      onCommit={(val) => onUpdateItem(index, { unit_cost: val, subtotal: item.bulk_quantity * val })}
                      parse={parseFloat}
                      min={0}
                      step="0.01"
                      widthClassName="w-24"
                    />
                  )}
                </div>

                {poType === "immediate" && (
                  <>
                    <div role="cell" className="px-3 py-2">
                      <Input
                        className="min-w-24"
                        placeholder="e.g. BATCH-123"
                        value={item.lot_number || ""}
                        onChange={(e) => onUpdateItem(index, { lot_number: e.target.value })}
                      />
                    </div>
                    <div role="cell" className="px-3 py-2">
                      <DatePickerInput
                        value={item.expiry_date}
                        onChange={(val) => onUpdateItem(index, { expiry_date: val })}
                        placeholder="Select"
                        disablePast
                        fromYear={new Date().getFullYear()}
                        toYear={new Date().getFullYear() + 15}
                      />
                    </div>
                  </>
                )}

                <div role="cell" className="px-3 py-2 text-right font-semibold text-foreground">
                  {formatCurrency(poType === "immediate" ? total : item.subtotal)}
                </div>

                {poType === "immediate" && (
                  <div role="cell" className="px-3 py-2 flex justify-end">
                    <POReviewPricePopover
                      costPrice={effectiveCost}
                      sellingPrice={item.selling_price ?? ""}
                      onSellingPriceChange={(val) => onUpdateItem(index, { selling_price: val })}
                    />
                  </div>
                )}

                <div role="cell" className="px-3 py-2 flex justify-end">
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    className="h-7 w-7 text-muted-foreground hover:text-destructive"
                    onClick={() => onRemoveItem(index)}
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                  </Button>
                </div>
              </div>
            );
          })}
          {items.length === 0 && (
            <div role="row" className={`grid ${gridCols}`}>
              <div role="cell" className="col-span-full px-3 py-8 text-center text-muted-foreground">
                Search above to add items to this order.
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
