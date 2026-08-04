"use client";

import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { formatCurrency } from "@/lib/utils";
import { RotateCcw } from "lucide-react";
import type { SaleItemDetail } from "@/lib/types/sale";

export function TransactionItemsView({
  items,
  currencyCode,
}: {
  items: SaleItemDetail[];
  currencyCode?: string;
}) {
  return (
    <>
      {/* Desktop Table View */}
      <div className="hidden sm:block mt-6 border border-border rounded-md overflow-hidden">
        <Table>
          <TableHeader className="bg-muted/50">
            <TableRow>
              <TableHead>Item</TableHead>
              <TableHead className="text-right">Qty</TableHead>
              <TableHead className="text-right">Price</TableHead>
              <TableHead className="text-right">Total</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {items?.map((item: SaleItemDetail) => (
              <TableRow key={item.id}>
                <TableCell className="font-medium">
                  {item.product_name || "Unknown Item"}
                </TableCell>
                <TableCell className="text-right">
                  <span>{item.quantity}</span>
                  {(item.returned_quantity ?? 0) > 0 && (
                    <span className="text-destructive text-xs ml-1 font-medium block">
                      (-{item.returned_quantity} returned)
                    </span>
                  )}
                </TableCell>
                <TableCell className="text-right text-muted-foreground">
                  {formatCurrency(item.unit_price, currencyCode)}
                </TableCell>
                <TableCell className="text-right font-semibold">
                  {formatCurrency(item.total_price, currencyCode)}
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>

      {/* Mobile Cards View */}
      <div className="sm:hidden mt-5 space-y-3">
        <h4 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-2">
          Items
        </h4>
        {items?.map((item: SaleItemDetail) => (
          <div
            key={item.id}
            className="bg-card border border-border rounded-[14px] p-3.5 shadow-sm"
          >
            <div className="font-semibold text-[14px] text-foreground mb-2 leading-tight">
              {item.product_name || "Unknown Item"}
            </div>
            <div className="flex justify-between items-center text-[13px] mb-2.5">
              <span className="text-muted-foreground">
                Qty:{" "}
                <span className="font-semibold text-foreground ml-1">
                  {item.quantity}
                </span>
              </span>
              <span className="text-muted-foreground">
                Price:{" "}
                <span className="font-medium text-foreground ml-1">
                  {formatCurrency(item.unit_price, currencyCode)}
                </span>
              </span>
            </div>
            <div className="flex justify-between items-center pt-2.5 border-t border-border/60">
              <span className="text-[12px] font-semibold text-muted-foreground uppercase tracking-wide">
                Total
              </span>
              <span className="font-bold text-[15px] text-primary">
                {formatCurrency(item.total_price, currencyCode)}
              </span>
            </div>
            {(item.returned_quantity ?? 0) > 0 && (
              <div className="mt-2 pt-2 border-t border-destructive/10 text-[12px] font-semibold text-destructive flex items-center">
                <RotateCcw className="w-3 h-3 mr-1" />
                {item.returned_quantity} units returned
              </div>
            )}
          </div>
        ))}
      </div>
    </>
  );
}
