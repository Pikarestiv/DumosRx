"use client";

import { Minus, Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { TableCell, TableRow } from "@/components/ui/table";
import { formatCurrency } from "@/lib/utils";

interface Props {
  item: any;
  quantity: number;
  selected: boolean;
  currencyCode?: string;
  onToggle: () => void;
  onQtyChange: (qty: number) => void;
}

export function ReturnItemRow({ item, quantity, selected, currencyCode, onToggle, onQtyChange }: Props) {
  return (
    <TableRow>
      <TableCell>
        <input
          type="checkbox"
          className="h-4 w-4 rounded border-gray-300 text-accent focus:ring-accent"
          checked={selected}
          onChange={onToggle}
        />
      </TableCell>
      <TableCell className="font-medium">{item.product_name}</TableCell>
      <TableCell className="text-right">{item.quantity}</TableCell>
      <TableCell className="text-right">
        <div className="flex items-center justify-end gap-0">
          <Button
            variant="outline"
            size="icon"
            className="h-8 w-8 rounded-r-none border-r-0"
            onClick={() => onQtyChange(quantity - 1)}
            disabled={quantity <= 1}
          >
            <Minus className="h-3 w-3" />
          </Button>
          <Input
            type="number"
            className="w-14 h-8 text-center rounded-none px-1"
            value={quantity}
            onChange={(e) => onQtyChange(parseInt(e.target.value) || 1)}
          />
          <Button
            variant="outline"
            size="icon"
            className="h-8 w-8 rounded-l-none border-l-0"
            onClick={() => onQtyChange(quantity + 1)}
            disabled={quantity >= item.quantity}
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
