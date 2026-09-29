"use client";

import React from "react";
import { Trash2 } from "lucide-react";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { EditableNumberCell } from "@/components/ui/editable-number-cell";
import { useUppercaseDisplayClass } from "@/lib/hooks/use-uppercase-display";
import {
  computeStockAfter,
  resolveAdjustmentDelta,
  type AdjustmentReasonValue,
} from "./adjustment-derivations";
import type { AdjustmentDraftItem } from "./adjustment-items-step";
import type { AdjustmentItemListProps } from "./adjustment-items-table";

/** Memoised for the same reason as AdjustmentItemRow. */
const AdjustmentItemCard = React.memo(function AdjustmentItemCard({
  item,
  reason,
  capsClass,
  onChangeQuantity,
  onRemove,
}: {
  item: AdjustmentDraftItem;
  reason: AdjustmentReasonValue;
  capsClass: string;
  onChangeQuantity: (productId: string, quantity: number) => void;
  onRemove: (productId: string) => void;
}) {
  const stockAfter = computeStockAfter(
    item.currentStock,
    resolveAdjustmentDelta(reason, item.quantity),
  );

  return (
    <div data-testid={`adjustment-item-${item.productId}`} className="p-4 space-y-3">
      <div className="flex justify-between items-start gap-2">
        <div className="min-w-0">
          <h4 className={`font-semibold text-[14px] truncate ${capsClass}`}>{item.name}</h4>
          <p className="text-[12px] text-muted-foreground/70">{item.sku}</p>
        </div>
        <Button
          type="button"
          variant="ghost"
          size="icon"
          aria-label={`Remove ${item.name}`}
          className="h-7 w-7 shrink-0 text-muted-foreground hover:text-destructive"
          onClick={() => onRemove(item.productId)}
        >
          <Trash2 className="w-3.5 h-3.5" />
        </Button>
      </div>

      <div className="grid grid-cols-3 gap-3 items-end">
        <div className="space-y-1">
          <Label className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wide">
            Current
          </Label>
          <div data-testid="current-stock" className="text-[14px] font-semibold py-1">
            {item.currentStock}
          </div>
        </div>
        <div className="space-y-1">
          <Label className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wide">
            Quantity
          </Label>
          <EditableNumberCell
            value={item.quantity}
            onCommit={(val) => onChangeQuantity(item.productId, val)}
            parse={(raw) => parseInt(raw, 10)}
            min={0}
            widthClassName="w-full"
            ariaLabel={`Quantity for ${item.name}`}
          />
        </div>
        <div className="space-y-1">
          <Label className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wide">
            Stock After
          </Label>
          <div data-testid="stock-after" className="text-[14px] font-bold py-1">
            {stockAfter}
          </div>
        </div>
      </div>
    </div>
  );
});

/** Phone-width equivalent of AdjustmentItemsTable: same four fields, one card
 * per item instead of table columns — the same reasoning that gives the PO
 * item builder a POItemCardList below 640px. */
export function AdjustmentItemsCardList({
  reason,
  items,
  onChangeQuantity,
  onRemove,
}: AdjustmentItemListProps) {
  const capsClass = useUppercaseDisplayClass();

  return (
    <div className="border border-border rounded-2xl divide-y divide-border">
      {items.map((item) => (
        <AdjustmentItemCard
          key={item.productId}
          item={item}
          reason={reason}
          capsClass={capsClass}
          onChangeQuantity={onChangeQuantity}
          onRemove={onRemove}
        />
      ))}
    </div>
  );
}
