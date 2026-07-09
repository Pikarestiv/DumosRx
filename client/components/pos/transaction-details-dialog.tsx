"use client";

import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { formatCurrency } from "@/lib/utils";
import { useLocalData } from "@/lib/db/hooks/useLocalData";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Button } from "@/components/ui/button";
import { Printer, RotateCcw } from "lucide-react";
import { useAuth } from "@/lib/context/auth-context";

interface TransactionDetailsDialogProps {
  sale: any;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  currencyCode?: string;
  onReturnClick?: (sale: any) => void;
}

export function TransactionDetailsDialog({
  sale,
  open,
  onOpenChange,
  currencyCode,
  onReturnClick,
}: TransactionDetailsDialogProps) {
  const { isAdmin } = useAuth();
  const { data: items } = useLocalData<any>(
    open && sale?.id
      ? `SELECT 
          si.*, 
          m.name as product_name, 
          m.cost_price as med_cost_price,
          COALESCE((
            SELECT SUM(ri.quantity) 
            FROM return_items ri 
            JOIN returns r ON ri.return_id = r.id 
            WHERE r.sale_id = si.sale_id AND ri.product_id = si.product_id AND (ri._deleted = 0 OR ri._deleted IS NULL) AND (r._deleted = 0 OR r._deleted IS NULL)
          ), 0) as returned_quantity
         FROM sale_items si 
         LEFT JOIN products m ON si.product_id = m.id 
         WHERE si.sale_id = '${sale.id}' AND (si._deleted = 0 OR si._deleted IS NULL)`
      : "SELECT 1 WHERE 1=0",
  );

  const { data: returnsData } = useLocalData<any>(
    open && sale?.id
      ? `SELECT SUM(total_refunded) as total_refunded FROM returns WHERE sale_id = '${sale.id}' AND (_deleted = 0 OR _deleted IS NULL)`
      : "SELECT 1 WHERE 1=0"
  );

  if (!sale) return null;

  const totalRefunded = returnsData?.[0]?.total_refunded || 0;

  const totalCostPrice =
    items?.reduce((acc: number, item: any) => {
      const cost = (item.cost_price !== null && item.cost_price !== undefined)
        ? item.cost_price
        : (item.med_cost_price || 0);
      return acc + cost * item.quantity;
    }, 0) || 0;

  const returnedCostPrice =
    items?.reduce((acc: number, item: any) => {
      const cost = (item.cost_price !== null && item.cost_price !== undefined)
        ? item.cost_price
        : (item.med_cost_price || 0);
      return acc + cost * (item.returned_quantity || 0);
    }, 0) || 0;

  const profit = (sale.total_amount - totalRefunded) - (totalCostPrice - returnedCostPrice);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-2xl w-[95vw] sm:w-full max-h-[90vh] overflow-y-auto p-4 sm:p-6">
        <DialogHeader>
          <DialogTitle className="font-serif text-xl sm:text-2xl text-center sm:text-left">
            Transaction Details
          </DialogTitle>
          <DialogDescription className="text-center sm:text-left text-xs sm:text-sm">
            <span>Reference: {sale.transaction_number}</span>
            <span className="hidden sm:inline"> • </span>
            <span className="block sm:inline mt-1 sm:mt-0 text-muted-foreground/80 sm:text-muted-foreground">
              {new Date(sale.created_at).toLocaleString()}
            </span>
          </DialogDescription>
        </DialogHeader>

        <div className="grid grid-cols-2 gap-3 sm:gap-4 mt-4 p-3 sm:p-4 bg-muted/30 rounded-lg">
          <div>
            <p className="text-xs sm:text-sm text-muted-foreground">Customer</p>
            <p className="font-medium text-sm sm:text-base">{sale.customer_name || "Walk-in"}</p>
          </div>
          <div>
            <p className="text-xs sm:text-sm text-muted-foreground">Payment Method</p>
            <p className="font-medium capitalize text-sm sm:text-base">{sale.payment_method}</p>
          </div>
          <div>
            <p className="text-xs sm:text-sm text-muted-foreground">Total Sale Amount</p>
            <p className="font-medium text-base sm:text-lg text-primary">
              {formatCurrency(sale.total_amount, currencyCode)}
            </p>
            {totalRefunded > 0 && (
              <p className="text-xs font-medium text-destructive mt-0.5">
                -{formatCurrency(totalRefunded, currencyCode)} refunded
              </p>
            )}
          </div>
          <div>
            <p className="text-xs sm:text-sm text-muted-foreground">Total Profit</p>
            <p
              className={`font-medium text-base sm:text-lg ${profit >= 0 ? "text-green-600" : "text-red-600"}`}
            >
              {formatCurrency(profit, currencyCode)}
            </p>
          </div>
        </div>

        <div className="mt-6 border rounded-md overflow-hidden">
          <Table>
            <TableHeader className="bg-muted">
              <TableRow>
                <TableHead>Item</TableHead>
                <TableHead className="text-right">Qty</TableHead>
                <TableHead className="text-right">Price</TableHead>
                <TableHead className="text-right">Total</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {items?.map((item: any) => (
                <TableRow key={item.id}>
                  <TableCell>{item.product_name || "Unknown Item"}</TableCell>
                  <TableCell className="text-right">
                    <span>{item.quantity}</span>
                    {item.returned_quantity > 0 && (
                      <span className="text-destructive text-xs ml-1 font-medium block">
                        (-{item.returned_quantity} returned)
                      </span>
                    )}
                  </TableCell>
                  <TableCell className="text-right">
                    {formatCurrency(item.unit_price, currencyCode)}
                  </TableCell>
                  <TableCell className="text-right font-medium">
                    {formatCurrency(item.total_price, currencyCode)}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>

        <div className="flex justify-end gap-3 mt-6 pt-4 border-t hide-on-print">
          {isAdmin && onReturnClick && (
            <Button
              variant="outline"
              onClick={() => {
                onOpenChange(false);
                onReturnClick(sale);
              }}
              className="text-amber-600 hover:text-amber-700 hover:bg-amber-50"
            >
              <RotateCcw className="w-4 h-4 mr-2" />
              Recall / Return
            </Button>
          )}
          <Button onClick={() => window.print()}>
            <Printer className="w-4 h-4 mr-2" />
            Print Receipt
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
