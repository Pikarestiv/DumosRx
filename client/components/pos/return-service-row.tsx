"use client";

import { Minus, Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { TableCell, TableRow } from "@/components/ui/table";
import { formatCurrency } from "@/lib/utils";
import type { SaleServiceDetail } from "@/lib/types/sale";

interface Props {
  service: SaleServiceDetail;
  quantity: number;
  selected: boolean;
  maxQty: number;
  currencyCode?: string;
  onToggle: () => void;
  onQtyChange: (qty: number) => void;
}

export function ReturnServiceRow({
  service,
  quantity,
  selected,
  maxQty,
  currencyCode,
  onToggle,
  onQtyChange,
}: Props) {
  const alreadyReturned = service.returned_quantity ?? 0;
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
      <TableCell>
        <div className="font-medium text-foreground flex items-center gap-2">
          <span>{service.service_name || service.name || "Service"}</span>
          <span className="text-[10px] font-semibold tracking-wider uppercase px-1.5 py-0.5 rounded bg-muted text-muted-foreground">
            Service
          </span>
        </div>
        {alreadyReturned > 0 && (
          <div className="text-xs text-muted-foreground">
            {alreadyReturned} already returned
          </div>
        )}
      </TableCell>
      <TableCell className="text-right">{service.quantity}</TableCell>
      <TableCell className="text-right">
        {!fullyReturned && selected ? (
          <div className="flex items-center justify-end gap-1">
            <Button
              type="button"
              variant="outline"
              size="icon"
              className="h-7 w-7"
              onClick={() => onQtyChange(quantity - 1)}
              disabled={quantity <= 1}
            >
              <Minus className="h-3 w-3" />
            </Button>
            <span className="w-8 text-center text-sm font-medium">{quantity}</span>
            <Button
              type="button"
              variant="outline"
              size="icon"
              className="h-7 w-7"
              onClick={() => onQtyChange(quantity + 1)}
              disabled={quantity >= maxQty}
            >
              <Plus className="h-3 w-3" />
            </Button>
          </div>
        ) : (
          <span className="text-muted-foreground">-</span>
        )}
      </TableCell>
      <TableCell className="text-right text-xs text-muted-foreground">
        Non-stock
      </TableCell>
      <TableCell className="text-right font-medium">
        {selected ? formatCurrency(service.unit_price * quantity, currencyCode) : "-"}
      </TableCell>
    </TableRow>
  );
}
