"use client";

import { Trash2 } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { DatePickerInput } from "@/components/ui/date-picker-input";
import { EditableNumberCell } from "@/components/ui/editable-number-cell";
import { POReviewPricePopover } from "./po-review-price-popover";
import { formatCurrency } from "@/lib/utils";
import type { POProduct } from "@/lib/db/queries/procurement";
import type { POLineItemDraft } from "./po-item-ledger-table";

interface POItemCardListProps {
  poType: "standard" | "immediate";
  items: POLineItemDraft[];
  products: POProduct[];
  onUpdateItem: (index: number, patch: Partial<POLineItemDraft>) => void;
  onRemoveItem: (index: number) => void;
}

/** Phone-width equivalent of POItemLedgerTable: same fields, one card per
 * item instead of table columns — the ledger's columns are too cramped to
 * use even with horizontal scroll below 640px, same reasoning as
 * ReceiveItemCard in receive-po-panel.tsx. */
export function POItemCardList({
  poType,
  items,
  products,
  onUpdateItem,
  onRemoveItem,
}: POItemCardListProps) {
  if (items.length === 0) {
    return (
      <div className="border border-border rounded-xl px-4 py-8 text-center text-muted-foreground text-[13px]">
        Search above to add items to this order.
      </div>
    );
  }

  return (
    <div className="border border-border rounded-xl divide-y divide-border">
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
          <div key={`${item.product_id}_${index}`} className="p-4 space-y-3">
            <div className="flex justify-between items-start gap-2">
              <div className="min-w-0">
                <h4 className="font-semibold text-[14px] truncate">{item.product_name}</h4>
                {poType === "immediate" && (
                  <p className="text-[12px] text-muted-foreground">
                    Stock: {stock} · Current Cost: {formatCurrency(currentCost)}
                  </p>
                )}
              </div>
              <Button
                type="button"
                variant="ghost"
                size="icon"
                className="h-7 w-7 shrink-0 text-muted-foreground hover:text-destructive"
                onClick={() => onRemoveItem(index)}
              >
                <Trash2 className="w-3.5 h-3.5" />
              </Button>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1">
                <Label className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wide">
                  {poType === "immediate" ? "Received" : "Qty"} ({item.bulk_unit})
                </Label>
                <EditableNumberCell
                  value={item.bulk_quantity}
                  onCommit={(val) => onUpdateItem(index, { bulk_quantity: val })}
                  parse={(raw) => parseInt(raw, 10)}
                  min={0}
                  widthClassName="w-full"
                />
              </div>
              <div className="space-y-1">
                <Label className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wide">
                  {poType === "immediate" ? "New Cost" : "Unit Cost"}
                </Label>
                {poType === "immediate" ? (
                  <Input
                    type="number"
                    min={0}
                    step="0.01"
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
                    widthClassName="w-full"
                  />
                )}
              </div>
            </div>

            {poType === "immediate" && (
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1">
                  <Label className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wide">
                    Lot/Batch (Optional)
                  </Label>
                  <Input
                    placeholder="e.g. BATCH-123"
                    value={item.lot_number || ""}
                    onChange={(e) => onUpdateItem(index, { lot_number: e.target.value })}
                  />
                </div>
                <div className="space-y-1">
                  <Label className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wide">
                    Expiry (Optional)
                  </Label>
                  <DatePickerInput
                    value={item.expiry_date}
                    onChange={(val) => onUpdateItem(index, { expiry_date: val })}
                    placeholder="Select"
                    disablePast
                    fromYear={new Date().getFullYear()}
                    toYear={new Date().getFullYear() + 15}
                  />
                </div>
              </div>
            )}

            <div className="flex items-center justify-between pt-1">
              <span className="text-[12px] font-semibold text-muted-foreground uppercase tracking-wide">
                {poType === "immediate" ? "Total" : "Subtotal"}
              </span>
              <span className="text-[14px] font-bold text-foreground">
                {formatCurrency(poType === "immediate" ? total : item.subtotal)}
              </span>
            </div>

            {poType === "immediate" && (
              <POReviewPricePopover
                costPrice={effectiveCost}
                sellingPrice={item.selling_price ?? ""}
                onSellingPriceChange={(val) => onUpdateItem(index, { selling_price: val })}
              />
            )}
          </div>
        );
      })}
    </div>
  );
}
