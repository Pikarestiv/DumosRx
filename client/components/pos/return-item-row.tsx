"use client";

import { Minus, Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { TableCell, TableRow } from "@/components/ui/table";
import { formatCurrency } from "@/lib/utils";
import type { SaleItemDetail } from "@/lib/types/sale";
import { ProductName } from "@/components/ui/product-name";

export const RETURN_DISCARD_REASONS = [
  "Damaged / Broken",
  "Opened / Unsealed",
  "Expired / Degraded",
  "Defective",
] as const;

interface Props {
  item: SaleItemDetail;
  quantity: number;
  discardQuantity?: number;
  discardReason?: string;
  selected: boolean;
  /** Quantity still eligible to return: item.quantity minus whatever was
   * already returned in a prior return on this same sale. */
  maxQty: number;
  currencyCode?: string;
  isSpotSourced?: boolean;
  onToggle: () => void;
  onQtyChange: (qty: number) => void;
  onDiscardQtyChange?: (qty: number) => void;
  onDiscardReasonChange?: (reason: string) => void;
}

export function ReturnItemRow({
  item,
  quantity,
  discardQuantity = 0,
  discardReason = "Damaged / Broken",
  selected,
  maxQty,
  currencyCode,
  isSpotSourced,
  onToggle,
  onQtyChange,
  onDiscardQtyChange,
  onDiscardReasonChange,
}: Props) {
  const alreadyReturned = item.quantity - maxQty;
  const fullyReturned = maxQty <= 0;
  const restockQty = Math.max(0, quantity - discardQuantity);

  return (
    <TableRow className={fullyReturned ? "opacity-50" : undefined}>
      <TableCell>
        <input
          type="checkbox"
          className="h-4 w-4 rounded border-gray-300 text-accent focus:ring-accent"
          checked={selected}
          onChange={onToggle}
          disabled={fullyReturned}
        />
      </TableCell>
      <TableCell className="font-medium">
        <div className="flex items-center gap-1.5 flex-wrap">
          <ProductName name={item.product_name || ""} />
          {isSpotSourced && (
            <span className="text-[10px] bg-amber-500/10 text-amber-600 dark:text-amber-400 font-medium px-1.5 py-0.5 rounded border border-amber-500/20">
              Spot-Sourced
            </span>
          )}
        </div>
        {alreadyReturned > 0 && (
          <div className="text-xs text-muted-foreground mt-0.5">
            {fullyReturned ? "Fully returned" : `${alreadyReturned} already returned`}
          </div>
        )}
        {selected && (
          <div className="text-xs text-muted-foreground mt-1 flex items-center gap-1.5 flex-wrap">
            <span className="text-emerald-600 dark:text-emerald-400 font-medium">
              {restockQty} restock
            </span>
            <span>•</span>
            <span
              className={
                discardQuantity > 0
                  ? "text-rose-600 dark:text-rose-400 font-medium"
                  : "text-muted-foreground"
              }
            >
              {discardQuantity} discard (loss)
            </span>
          </div>
        )}
      </TableCell>
      <TableCell className="text-right">{item.quantity}</TableCell>
      <TableCell className="text-right">
        <div className="flex items-center justify-end gap-0">
          <Button
            variant="outline"
            size="icon"
            aria-label="Decrease return quantity"
            className="h-8 w-8 rounded-r-none border-r-0"
            onClick={() => onQtyChange(quantity - 1)}
            disabled={fullyReturned || quantity <= 1}
          >
            <Minus className="h-3 w-3" />
          </Button>
          <Input
            type="number"
            inputMode="numeric"
            className="w-14 h-8 text-center rounded-none px-1"
            value={quantity}
            onChange={(e) => onQtyChange(parseInt(e.target.value) || 1)}
            disabled={fullyReturned}
          />
          <Button
            variant="outline"
            size="icon"
            aria-label="Increase return quantity"
            className="h-8 w-8 rounded-l-none border-l-0"
            onClick={() => onQtyChange(quantity + 1)}
            disabled={fullyReturned || quantity >= maxQty}
          >
            <Plus className="h-3 w-3" />
          </Button>
        </div>
      </TableCell>
      <TableCell className="text-right">
        <div className="flex flex-col items-end gap-1">
          <div className="flex items-center justify-end gap-0">
            <Button
              variant="outline"
              size="icon"
              aria-label="Decrease discard quantity"
              className="h-8 w-8 rounded-r-none border-r-0"
              onClick={() => onDiscardQtyChange?.(Math.max(0, discardQuantity - 1))}
              disabled={fullyReturned || !selected || discardQuantity <= 0}
            >
              <Minus className="h-3 w-3" />
            </Button>
            <Input
              type="number"
              inputMode="numeric"
              className="w-14 h-8 text-center rounded-none px-1"
              value={discardQuantity}
              onChange={(e) => {
                const val = parseInt(e.target.value) || 0;
                onDiscardQtyChange?.(Math.min(Math.max(0, val), quantity));
              }}
              disabled={fullyReturned || !selected}
            />
            <Button
              variant="outline"
              size="icon"
              aria-label="Increase discard quantity"
              className="h-8 w-8 rounded-l-none border-l-0"
              onClick={() => onDiscardQtyChange?.(Math.min(quantity, discardQuantity + 1))}
              disabled={fullyReturned || !selected || discardQuantity >= quantity}
            >
              <Plus className="h-3 w-3" />
            </Button>
          </div>
          {selected && discardQuantity > 0 && onDiscardReasonChange && (
            <select
              aria-label="Discard reason"
              className="text-xs h-7 px-1.5 py-0 border rounded bg-background text-foreground"
              value={discardReason}
              onChange={(e) => onDiscardReasonChange(e.target.value)}
            >
              {RETURN_DISCARD_REASONS.map((r) => (
                <option key={r} value={r}>
                  {r}
                </option>
              ))}
            </select>
          )}
        </div>
      </TableCell>
      <TableCell className="text-right font-medium">
        {formatCurrency(quantity * item.unit_price, currencyCode)}
      </TableCell>
    </TableRow>
  );
}
