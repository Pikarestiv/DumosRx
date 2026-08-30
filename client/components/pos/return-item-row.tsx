"use client";

import { Minus, Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { TableCell, TableRow } from "@/components/ui/table";
import { formatCurrency } from "@/lib/utils";
import type { SaleItemDetail } from "@/lib/types/sale";

interface Props {
  item: SaleItemDetail;
  quantity: number;
  selected: boolean;
  /** Quantity still eligible to return: item.quantity minus whatever was
   * already returned in a prior return on this same sale. */
  maxQty: number;
  currencyCode?: string;
  onToggle: () => void;
  onQtyChange: (qty: number) => void;
}

export function ReturnItemRow({ item, quantity, selected, maxQty, currencyCode, onToggle, onQtyChange }: Props) {
  const alreadyReturned = item.quantity - maxQty;
  const fullyReturned = maxQty <= 0;

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
        {item.product_name}
        {alreadyReturned > 0 && (
          <div className="text-xs text-muted-foreground">
            {fullyReturned ? "Fully returned" : `${alreadyReturned} already returned`}
          </div>
        )}
      </TableCell>
      <TableCell className="text-right">{item.quantity}</TableCell>
      <TableCell className="text-right">
        <div className="flex items-center justify-end gap-0">
          <Button
            variant="outline"
            size="icon"
            className="h-8 w-8 rounded-r-none border-r-0"
            onClick={() => onQtyChange(quantity - 1)}
            disabled={fullyReturned || quantity <= 1}
          >
            <Minus className="h-3 w-3" />
          </Button>
          <Input
            type="number"
            className="w-14 h-8 text-center rounded-none px-1"
            value={quantity}
            onChange={(e) => onQtyChange(parseInt(e.target.value) || 1)}
            disabled={fullyReturned}
          />
          <Button
            variant="outline"
            size="icon"
            className="h-8 w-8 rounded-l-none border-l-0"
            onClick={() => onQtyChange(quantity + 1)}
            disabled={fullyReturned || quantity >= maxQty}
          >
            <Plus className="h-3 w-3" />
          </Button>
        </div>
      </TableCell>
      <TableCell className="text-right">
        {formatCurrency(quantity * item.unit_price, currencyCode)}
      </TableCell>
    </TableRow>
  );
}
