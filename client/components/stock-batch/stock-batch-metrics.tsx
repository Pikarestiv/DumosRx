"use client";

import { MetricCard } from "@/components/ui/metric-card";
import {
  DollarSign,
  TrendingDown,
  Calendar,
  Package,
} from "lucide-react";

import { useStore } from "@/lib/context/store-context";
import { useStockMoM } from "@/lib/hooks/use-analytics";

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
  const { data: momData } = useStockMoM();
  const expiryDays = storeProfile?.expiry_warning_days || 90;

  return (
    <div className="-mx-4 sm:mx-0 px-4 sm:px-0">
      <div className="flex overflow-x-auto sm:grid sm:grid-cols-2 lg:grid-cols-4 gap-2 sm:gap-4 pb-4 sm:pb-0 hide-scrollbar snap-x snap-mandatory">
        
        {/* Total Stock Value */}
        <MetricCard
          className="min-w-[180px] sm:min-w-0 snap-center shrink-0 border-border"
          title="Total stock value"
          value={formatCurrency(stock_batchValue)}
          icon={<DollarSign className="h-4 w-4" />}
          iconBgClass="bg-blue-50 text-blue-700"
          description={
            momData ? (
              <>
                <span className={momData.percentChange >= 0 ? "text-emerald-600" : "text-rose-600"}>
                  {momData.percentChange >= 0 ? "+" : ""}{momData.percentChange.toFixed(1)}%
                </span> from last month
              </>
            ) : undefined
          }
        />

        {/* Total Products */}
        <MetricCard
          className="min-w-[180px] sm:min-w-0 snap-center shrink-0 border-border"
          title="Total products"
          value={totalProducts}
          icon={<Package className="h-4 w-4 hover-rotate-icon" />}
          iconBgClass="bg-sky-50 text-sky-700"
          description={`Across ${activeCategories} categories`}
        />

        {/* Low Stock Items */}
        <MetricCard
          className="min-w-[180px] sm:min-w-0 snap-center shrink-0 border-amber-200/50 hover:border-amber-500/50"
          title="Low stock"
          value={lowStockCount}
          valueClassName="text-amber-700"
          icon={<TrendingDown className="h-4 w-4 hover-rotate-icon" />}
          iconBgClass="bg-amber-50 text-amber-700"
          description="Below reorder level"
          descriptionClassName="text-amber-700/70"
        />

        {/* Expiring Soon */}
        <MetricCard
          className="min-w-[180px] sm:min-w-0 snap-center shrink-0 border-red-200/50 hover:border-red-500/50"
          title="Expiring soon"
          value={expiringCount}
          valueClassName="text-red-700"
          icon={<Calendar className="h-4 w-4" />}
          iconBgClass="bg-red-50 text-red-700"
          description={`Within ${expiryDays} days`}
          descriptionClassName="text-red-700/70"
        />
        
      </div>
    </div>
  );
}
