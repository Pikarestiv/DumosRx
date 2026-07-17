"use client";

import { Card, CardContent } from "@/components/ui/card";
import {
  DollarSign,
  AlertTriangle,
  TrendingDown,
  Calendar,
} from "lucide-react";

import { useStore } from "@/lib/context/store-context";

interface StockBatchMetricsProps {
  stock_batchValue: number;
  criticalItems: number;
  lowStockCount: number;
  expiringCount: number;
  formatCurrency: (amount: number) => string;
}

export function StockBatchMetrics({
  stock_batchValue,
  criticalItems,
  lowStockCount,
  expiringCount,
  formatCurrency,
}: StockBatchMetricsProps) {
  const { storeProfile } = useStore();
  const expiryDays = storeProfile?.expiry_warning_days || 90;

  return (
    <div className="-mx-4 sm:mx-0 px-4 sm:px-0">
      <div className="flex overflow-x-auto sm:grid sm:grid-cols-2 lg:grid-cols-4 gap-[10px] sm:gap-4 pb-4 sm:pb-0 hide-scrollbar snap-x snap-mandatory">
        <Card className="min-w-[140px] sm:min-w-0 snap-center shrink-0 border-border">
          <CardContent className="p-4 hover-scale">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-xs sm:text-sm text-muted-foreground">
                  Total Stock Batch Value
                </p>
                <p className="text-xl sm:text-2xl font-bold">
                  {formatCurrency(stock_batchValue)}
                </p>
              </div>
              <div className="h-8 w-8 bg-primary/10 rounded-full flex items-center justify-center shrink-0">
                <DollarSign className="h-4 w-4 text-primary" />
              </div>
            </div>
          </CardContent>
        </Card>

        <Card className="min-w-[140px] sm:min-w-0 snap-center shrink-0 border-border">
          <CardContent className="p-4 hover-scale">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-xs sm:text-sm text-muted-foreground">
                  Critical Stock Items
                </p>
                <p className="text-xl sm:text-2xl font-bold text-destructive">
                  {criticalItems}
                </p>
              </div>
              <div className="h-8 w-8 bg-destructive/10 rounded-full flex items-center justify-center shrink-0">
                <AlertTriangle className="h-4 w-4 text-destructive hover-rotate-icon" />
              </div>
            </div>
          </CardContent>
        </Card>

        <Card className="min-w-[140px] sm:min-w-0 snap-center shrink-0 border-border">
          <CardContent className="p-4 hover-scale">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-xs sm:text-sm text-muted-foreground">Low Stock Items</p>
                <p className="text-xl sm:text-2xl font-bold text-orange-600 dark:text-orange-400">
                  {lowStockCount}
                </p>
              </div>
              <div className="h-8 w-8 bg-orange-100 dark:bg-orange-950/30 rounded-full flex items-center justify-center shrink-0">
                <TrendingDown className="h-4 w-4 text-orange-600 dark:text-orange-400 hover-rotate-icon" />
              </div>
            </div>
          </CardContent>
        </Card>

        <Card className="min-w-[140px] sm:min-w-0 snap-center shrink-0 border-border">
          <CardContent className="p-4 hover-scale">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-xs sm:text-sm text-muted-foreground">
                  Expiring Soon ({expiryDays}d)
                </p>
                <p className="text-xl sm:text-2xl font-bold text-blue-600 dark:text-blue-400">
                  {expiringCount}
                </p>
              </div>
              <div className="h-8 w-8 bg-blue-100 dark:bg-blue-950/30 rounded-full flex items-center justify-center shrink-0">
                <Calendar className="h-4 w-4 text-blue-600 dark:text-blue-400 hover-rotate-icon" />
              </div>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
