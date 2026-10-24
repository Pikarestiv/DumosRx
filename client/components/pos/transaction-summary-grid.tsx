"use client";

import { formatCurrency } from "@/lib/utils";
import type { SaleWithDetails, SaleItemDetail } from "@/lib/types/sale";

function itemCost(item: SaleItemDetail) {
  return item.cost_price !== null && item.cost_price !== undefined
    ? item.cost_price
    : item.med_cost_price || 0;
}

export function computeSaleProfit(
  sale: SaleWithDetails,
  items: SaleItemDetail[],
  totalRefunded: number,
) {
  const totalCostPrice =
    items?.reduce((acc: number, item: SaleItemDetail) => acc + itemCost(item) * item.quantity, 0) || 0;
  const returnedCostPrice =
    items?.reduce(
      (acc: number, item: SaleItemDetail) => acc + itemCost(item) * (item.returned_quantity || 0),
      0,
    ) || 0;
  return (
    (sale.total_amount ?? sale.total ?? 0) -
    totalRefunded -
    (totalCostPrice - returnedCostPrice)
  );
}

interface TransactionSummaryGridProps {
  sale: SaleWithDetails;
  totalRefunded: number;
  profit: number;
  showProfit: boolean;
  currencyCode?: string;
}

export function TransactionSummaryGrid({
  sale,
  totalRefunded,
  profit,
  showProfit,
  currencyCode,
}: TransactionSummaryGridProps) {
  return (
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
            sale.total_amount ?? sale.total ?? 0,
            currencyCode,
          )}
        </p>
        {totalRefunded > 0 && (
          <p className="text-xs font-medium text-destructive mt-0.5">
            -{formatCurrency(totalRefunded, currencyCode)} refunded
          </p>
        )}
      </div>
      {showProfit && (
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
      )}
    </div>
  );
}
