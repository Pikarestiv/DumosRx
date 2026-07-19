"use client";

import { Card, CardContent } from "@/components/ui/card";
import {
  DollarSign,
  AlertTriangle,
  TrendingDown,
  Calendar,
  Package,
} from "lucide-react";

import { useStore } from "@/lib/context/store-context";

interface StockBatchMetricsProps {
  stock_batchValue: number;
  totalProducts: number;
  lowStockCount: number;
  expiringCount: number;
  activeCategories: number;
  formatCurrency: (amount: number) => string;
}

export function StockBatchMetrics({
  stock_batchValue,
  totalProducts,
  lowStockCount,
  expiringCount,
  activeCategories,
  formatCurrency,
}: StockBatchMetricsProps) {
  const { storeProfile } = useStore();
  const expiryDays = storeProfile?.expiry_warning_days || 90;

  return (
    <div className="-mx-4 sm:mx-0 px-4 sm:px-0">
      <div className="flex overflow-x-auto sm:grid sm:grid-cols-2 lg:grid-cols-4 gap-2 sm:gap-4 pb-4 sm:pb-0 hide-scrollbar snap-x snap-mandatory">
        
        {/* Total Stock Value */}
        <Card className="min-w-[140px] sm:min-w-0 snap-center shrink-0 border-border rounded-[14px] shadow-sm !p-0 !gap-0">
          <CardContent className="!p-3 sm:!p-[18px] !px-3.5 sm:!px-5 hover-scale flex flex-col">
            <div className="flex items-center justify-between mb-2 sm:mb-3.5">
              <div className="text-[12.5px] text-muted-foreground font-medium">
                Total stock value
              </div>
              <div className="hidden sm:flex w-8 h-8 rounded-lg items-center justify-center bg-blue-50 text-blue-700 shrink-0">
                <DollarSign className="h-4 w-4" />
              </div>
            </div>
            <div className="text-2xl font-semibold tracking-tight mb-1">
              {formatCurrency(stock_batchValue)}
            </div>
            <div className="text-[11px] text-muted-foreground font-medium mt-auto">
              <span className="text-emerald-600">+2.4%</span> from last month
            </div>
          </CardContent>
        </Card>

        {/* Total Products */}
        <Card className="min-w-[140px] sm:min-w-0 snap-center shrink-0 border-border rounded-[14px] shadow-sm !p-0 !gap-0">
          <CardContent className="!p-3 sm:!p-[18px] !px-3.5 sm:!px-5 hover-scale flex flex-col">
            <div className="flex items-center justify-between mb-2 sm:mb-3.5">
              <div className="text-[12.5px] text-muted-foreground font-medium">
                Total products
              </div>
              <div className="hidden sm:flex w-8 h-8 rounded-lg items-center justify-center bg-sky-50 text-sky-700 shrink-0">
                <Package className="h-4 w-4 hover-rotate-icon" />
              </div>
            </div>
            <div className="text-2xl font-semibold tracking-tight mb-1">
              {totalProducts}
            </div>
            <div className="text-[11px] text-muted-foreground font-medium mt-auto">
              Across {activeCategories} categories
            </div>
          </CardContent>
        </Card>

        {/* Low Stock Items */}
        <Card className="min-w-[140px] sm:min-w-0 snap-center shrink-0 border-amber-200/50 hover:border-amber-500/50 rounded-[14px] shadow-sm cursor-pointer transition-colors !p-0 !gap-0">
          <CardContent className="!p-3 sm:!p-[18px] !px-3.5 sm:!px-5 flex flex-col">
            <div className="flex items-center justify-between mb-2 sm:mb-3.5">
              <div className="text-[12.5px] text-muted-foreground font-medium">Low stock</div>
              <div className="hidden sm:flex w-8 h-8 rounded-lg items-center justify-center bg-amber-50 text-amber-700 shrink-0">
                <TrendingDown className="h-4 w-4 hover-rotate-icon" />
              </div>
            </div>
            <div className="text-2xl font-semibold tracking-tight mb-1 text-amber-700">
              {lowStockCount}
            </div>
            <div className="text-[11px] text-amber-700/70 font-medium mt-auto">
              Below reorder level
            </div>
          </CardContent>
        </Card>

        {/* Expiring Soon */}
        <Card className="min-w-[140px] sm:min-w-0 snap-center shrink-0 border-red-200/50 hover:border-red-500/50 rounded-[14px] shadow-sm cursor-pointer transition-colors !p-0 !gap-0">
          <CardContent className="!p-3 sm:!p-[18px] !px-3.5 sm:!px-5 flex flex-col">
            <div className="flex items-center justify-between mb-2 sm:mb-3.5">
              <div className="text-[12.5px] text-muted-foreground font-medium">
                Expiring soon
              </div>
              <div className="hidden sm:flex w-8 h-8 rounded-lg items-center justify-center bg-red-50 text-red-700 shrink-0">
                <Calendar className="h-4 w-4" />
              </div>
            </div>
            <div className="text-2xl font-semibold tracking-tight mb-1 text-red-700">
              {expiringCount}
            </div>
            <div className="text-[11px] text-red-700/70 font-medium mt-auto">
              Within {expiryDays} days
            </div>
          </CardContent>
        </Card>
        
      </div>
    </div>
  );
}
