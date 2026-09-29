"use client";

import React from "react";
import { Trash2, Search } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { DatePickerInput } from "@/components/ui/date-picker-input";
import { EditableNumberCell } from "@/components/ui/editable-number-cell";
import { POReviewPricePopover } from "./po-review-price-popover";
import { clampMoneyInput, getImmediateUnitCost, getLineTotal } from "./po-line-item-math";
import { formatCurrency } from "@/lib/utils";
import type { POProduct } from "@/lib/db/queries/procurement";
import { useProductMap, type POItemRow, type POLineItemDraft } from "./po-item-ledger-table";

interface POItemCardListProps {
  poType: "standard" | "immediate";
  rows: POItemRow[];
  products: POProduct[];
  onUpdateItem: (index: number, patch: Partial<POLineItemDraft>) => void;
  onRemoveItem: (index: number) => void;
  onFocusSearch?: () => void;
  isFiltered?: boolean;
}

/** Memoised for the same reason as POItemLedgerRow: a keystroke in one
 * card's quantity must not re-render every other card. */
const POItemCard = React.memo(function POItemCard({
  item,
  index,
  product,
  poType,
  onUpdateItem,
  onRemoveItem,
}: {
  item: POLineItemDraft;
  index: number;
  product: POProduct | undefined;
  poType: "standard" | "immediate";
  onUpdateItem: (index: number, patch: Partial<POLineItemDraft>) => void;
  onRemoveItem: (index: number) => void;
}) {
  const currentCost = product?.cost_price ?? 0;
  const stock = product?.stock_quantity ?? 0;
  const effectiveUnitCost = getImmediateUnitCost(item);
  const total = getLineTotal(item, poType);

  return (
    <div className="p-4 space-y-3">
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
          aria-label={`Remove ${item.product_name}`}
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
            ariaLabel={`${poType === "immediate" ? "Received" : "Quantity"} for ${item.product_name}`}
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
              widthClassName="w-full"
              ariaLabel={`Unit Cost for ${item.product_name}`}
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
              aria-label={`Lot or batch number for ${item.product_name}`}
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
              ariaLabel={`Expiry date for ${item.product_name}`}
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
          {formatCurrency(total)}
        </span>
      </div>

      {poType === "immediate" && (
        <POReviewPricePopover
          costPrice={effectiveUnitCost}
          sellingPrice={item.selling_price ?? (product?.selling_price || "")}
          currentSellingPrice={product?.selling_price ?? null}
          productName={item.product_name}
          onSellingPriceChange={(val) => onUpdateItem(index, { selling_price: val })}
        />
      )}
    </div>
  );
});

/** Phone-width equivalent of POItemLedgerTable: same fields, one card per
 * item instead of table columns — the ledger's columns are too cramped to
 * use even with horizontal scroll below 640px, same reasoning as
 * ReceiveItemCard in receive-po-panel.tsx. */
export function POItemCardList({
  poType,
  rows,
  products,
  onUpdateItem,
  onRemoveItem,
  onFocusSearch,
  isFiltered,
}: POItemCardListProps) {
  const productMap = useProductMap(products);

  if (rows.length === 0) {
    return (
      <div className="border border-border rounded-xl">
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
    );
  }

  return (
    <div className="border border-border rounded-xl divide-y divide-border">
      {rows.map(({ item, index }) => (
        <POItemCard
          key={`${item.product_id}_${index}`}
          item={item}
          index={index}
          product={productMap.get(item.product_id)}
          poType={poType}
          onUpdateItem={onUpdateItem}
          onRemoveItem={onRemoveItem}
        />
      ))}
    </div>
  );
}
