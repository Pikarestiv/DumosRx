"use client";

import React from "react";
import { Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { EditableNumberCell } from "@/components/ui/editable-number-cell";
import { useUppercaseDisplayClass } from "@/lib/hooks/use-uppercase-display";
import {
  adjustmentQuantityLabel,
  computeStockAfter,
  resolveAdjustmentDelta,
  type AdjustmentReasonValue,
} from "./adjustment-derivations";
import type { AdjustmentDraftItem } from "./adjustment-items-step";

export interface AdjustmentItemListProps {
  reason: AdjustmentReasonValue;
  items: AdjustmentDraftItem[];
  onChangeQuantity: (productId: string, quantity: number) => void;
  onRemove: (productId: string) => void;
}

const GRID_COLS = "grid-cols-[1fr_100px_110px_110px_44px]";

/** Memoised for the same reason as POItemLedgerRow: a keystroke in one row's
 * quantity must not re-render every other row's input. */
const AdjustmentItemRow = React.memo(function AdjustmentItemRow({
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
    resolveAdjustmentDelta(reason, item.quantity, item.currentStock),
  );

  return (
    <div
      role="row"
      data-testid={`adjustment-item-${item.productId}`}
      className={`grid ${GRID_COLS} items-center hover:bg-accent/30 transition-colors`}
    >
      <div role="cell" className="px-3 py-2 min-w-0">
        <div className={`font-semibold text-foreground truncate ${capsClass}`}>{item.name}</div>
        <div className="text-[11px] text-muted-foreground/70">{item.sku}</div>
      </div>

      <div role="cell" data-testid="current-stock" className="px-3 py-2 text-right text-muted-foreground">
        {item.currentStock}
      </div>

      <div role="cell" className="px-3 py-2 flex justify-end">
        <EditableNumberCell
          value={item.quantity}
          onCommit={(val) => onChangeQuantity(item.productId, val)}
          parse={(raw) => parseInt(raw, 10)}
          min={0}
          widthClassName="w-20"
          ariaLabel={`${adjustmentQuantityLabel(reason)} quantity for ${item.name}`}
        />
      </div>

      <div
        role="cell"
        data-testid="stock-after"
        className="px-3 py-2 text-right font-semibold text-foreground"
      >
        {stockAfter}
      </div>

      <div role="cell" className="px-3 py-2 flex justify-end">
        <Button
          type="button"
          variant="ghost"
          size="icon"
          aria-label={`Remove ${item.name}`}
          className="h-7 w-7 text-muted-foreground hover:text-destructive"
          onClick={() => onRemove(item.productId)}
        >
          <Trash2 className="w-3.5 h-3.5" />
        </Button>
      </div>
    </div>
  );
});

/** Tablet-and-up item list for the Adjust Stock flow, built on the same
 * div/ARIA-table conventions as procurement's po-item-ledger-table.tsx. It is
 * a separate component rather than a reuse of that one: POItemLedgerTable's
 * props are purchase-order specific (POLineItemDraft, poType, expected-date
 * and sell-price columns) and none of them fit an adjustment's four fields. */
export function AdjustmentItemsTable({
  reason,
  items,
  onChangeQuantity,
  onRemove,
}: AdjustmentItemListProps) {
  const capsClass = useUppercaseDisplayClass();

  return (
    <div className="border border-border rounded-2xl overflow-x-auto">
      <div role="table" aria-label="Items to adjust" className="w-full text-[12.5px]">
        <div role="rowgroup">
          <div
            role="row"
            className={`grid ${GRID_COLS} bg-muted/40 text-muted-foreground text-[11px] uppercase font-semibold`}
          >
            <div role="columnheader" className="text-left px-3 py-2">
              Item
            </div>
            <div
              role="columnheader"
              className="text-right px-3 py-2"
              title="Quantity currently on hand, before this adjustment"
            >
              Current
            </div>
            <div role="columnheader" className="text-right px-3 py-2">
              {adjustmentQuantityLabel(reason)}
            </div>
            <div role="columnheader" className="text-right px-3 py-2">
              Stock After
            </div>
            <div role="columnheader" />
          </div>
        </div>

        <div role="rowgroup" className="divide-y divide-border">
          {items.map((item) => (
            <AdjustmentItemRow
              key={item.productId}
              item={item}
              reason={reason}
              capsClass={capsClass}
              onChangeQuantity={onChangeQuantity}
              onRemove={onRemove}
            />
          ))}
        </div>
      </div>
    </div>
  );
}
