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
import { formatDateToDDMMYYYY } from "@/lib/utils/date-utils";
import { Button } from "@/components/ui/button";
import { Printer, RotateCcw } from "lucide-react";
import { useAuth } from "@/lib/context/auth-context";
import { ResponsiveModal } from "@/components/ui/responsive-modal";
import { useQuery } from "@tanstack/react-query";
import { getTransactionDetails } from "@/lib/db/queries/sales";

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
  const { data: detailsData } = useQuery({
    queryKey: ["transactionDetails", sale?.id],
    queryFn: () =>
      open && sale?.id ? getTransactionDetails(sale.id) : Promise.resolve(null),
    enabled: !!(open && sale?.id),
  });

  const items = detailsData?.items || [];
  const returnsData = detailsData?.returnsData || [];

  if (!sale) return null;

  const totalRefunded = returnsData?.[0]?.total_refunded || 0;

  const totalCostPrice =
    items?.reduce((acc: number, item: any) => {
      const cost =
        item.cost_price !== null && item.cost_price !== undefined
          ? item.cost_price
          : item.med_cost_price || 0;
      return acc + cost * item.quantity;
    }, 0) || 0;

  const returnedCostPrice =
    items?.reduce((acc: number, item: any) => {
      const cost =
        item.cost_price !== null && item.cost_price !== undefined
          ? item.cost_price
          : item.med_cost_price || 0;
      return acc + cost * (item.returned_quantity || 0);
    }, 0) || 0;

  const profit =
    (sale.total_amount !== undefined ? sale.total_amount : sale.total) -
    totalRefunded -
    (totalCostPrice - returnedCostPrice);

  const title = "Transaction Details";
  const description = (
    <>
      <span>Reference: {sale.transaction_number}</span>
      <span className="hidden sm:inline"> • </span>
      <span className="block sm:inline mt-1 sm:mt-0 text-muted-foreground/80 sm:text-muted-foreground">
        {formatDateToDDMMYYYY(sale.created_at)}{" "}
        {new Date(sale.created_at).toLocaleTimeString()}
      </span>
    </>
  );

  const footer = (
    <div className="flex flex-col sm:flex-row justify-end gap-3 hide-on-print">
      {isAdmin && onReturnClick && (
        <Button
          variant="outline"
          onClick={() => {
            onOpenChange(false);
            onReturnClick(sale);
          }}
          className="text-amber-600 hover:text-amber-700 hover:bg-amber-50 border-amber-200 w-full sm:w-auto"
        >
          <RotateCcw className="w-4 h-4 mr-2" />
          Recall / Return
        </Button>
      )}
      <Button onClick={() => window.print()} className="w-full sm:w-auto">
        <Printer className="w-4 h-4 mr-2" />
        Print Receipt
      </Button>
    </div>
  );

  const content = (
    <div className="flex flex-col max-h-[85vh] sm:max-h-[80vh]">
      <div className="flex-1 overflow-y-auto px-4 sm:px-6 pb-4">
        <div className="grid grid-cols-2 gap-3 sm:gap-4 mt-2 p-3 sm:p-4 bg-muted/30 rounded-lg">
          <div>
            <p className="text-xs sm:text-sm text-muted-foreground">Customer</p>
            <p className="font-medium text-sm sm:text-base">
              {sale.customer_name || "Walk-in"}
            </p>
          </div>
          <div>
            <p className="text-xs sm:text-sm text-muted-foreground">
              Payment Method
            </p>
            <p className="font-medium capitalize text-sm sm:text-base">
              {sale.payment_method}
            </p>
          </div>
          <div>
            <p className="text-xs sm:text-sm text-muted-foreground">
              Total Sale
            </p>
            <p className="font-medium text-base sm:text-lg text-primary">
              {formatCurrency(
                sale.total_amount !== undefined
                  ? sale.total_amount
                  : sale.total,
                currencyCode,
              )}
            </p>
            {totalRefunded > 0 && (
              <p className="text-xs font-medium text-destructive mt-0.5">
                -{formatCurrency(totalRefunded, currencyCode)} refunded
              </p>
            )}
          </div>
          <div>
            <p className="text-xs sm:text-sm text-muted-foreground">
              Total Profit
            </p>
            <p
              className={`font-medium text-base sm:text-lg ${profit >= 0 ? "text-emerald-600" : "text-destructive"}`}
            >
              {formatCurrency(profit, currencyCode)}
            </p>
          </div>
        </div>

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
              {items?.map((item: any) => (
                <TableRow key={item.id}>
                  <TableCell className="font-medium">
                    {item.product_name || "Unknown Item"}
                  </TableCell>
                  <TableCell className="text-right">
                    <span>{item.quantity}</span>
                    {item.returned_quantity > 0 && (
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
          {items?.map((item: any) => (
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
              {item.returned_quantity > 0 && (
                <div className="mt-2 pt-2 border-t border-destructive/10 text-[12px] font-semibold text-destructive flex items-center">
                  <RotateCcw className="w-3 h-3 mr-1" />
                  {item.returned_quantity} units returned
                </div>
              )}
            </div>
          ))}
        </div>
      </div>
    </div>
  );

  return (
    <ResponsiveModal
      open={open}
      onOpenChange={onOpenChange}
      title={title}
      description={description}
      className="sm:max-w-2xl w-full p-0 gap-0 overflow-hidden"
      headerClassName="px-4 pt-0 pb-2 sm:px-6 sm:pt-6 sm:pb-3 border-b sm:border-b-0 border-border"
      footer={
        <div className="p-4 sm:px-6 sm:py-4 border-t border-border bg-background pb-[calc(1rem+env(safe-area-inset-bottom,0px))]">
          {footer}
        </div>
      }
    >
      {content}
    </ResponsiveModal>
  );
}
