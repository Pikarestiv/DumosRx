"use client";

import { MetricCard } from "@/components/ui/metric-card";

interface SupplierStatsProps {
  totalSuppliers: number;
  activeSuppliers: number;
  totalValue: number;
  avgRating: number;
  ratingStars: string;
  formatCurrency: (amount: number) => string;
}

export function SupplierStats({
  totalSuppliers,
  activeSuppliers,
  totalValue,
  avgRating,
  ratingStars,
  formatCurrency
}: SupplierStatsProps) {
  return (
    <div className="-mx-4 sm:mx-0 px-4 sm:px-0 mb-5">
      <div className="flex overflow-x-auto sm:grid sm:grid-cols-3 gap-[10px] sm:gap-4 pb-4 sm:pb-0 hide-scrollbar snap-x snap-mandatory">
        
        <MetricCard
          className="min-w-[180px] sm:min-w-0 snap-center shrink-0 border-b-0 border-l-0 border-r-0 sm:border"
          title="Total suppliers"
          value={
            <div className="flex items-baseline gap-2">
              <span className="font-serif">{totalSuppliers}</span>
              <span className="text-[12px] text-primary tracking-normal">{activeSuppliers} active</span>
            </div>
          }
        />

        <MetricCard
          className="min-w-[180px] sm:min-w-0 snap-center shrink-0 border-b-0 border-l-0 border-r-0 sm:border"
          title="Total purchase value"
          value={formatCurrency(totalValue)}
          valueClassName="font-serif"
        />

        <MetricCard
          className="min-w-[180px] sm:min-w-0 snap-center shrink-0 border-b-0 border-l-0 border-r-0 sm:border"
          title="Average rating"
          value={
            <div className="flex items-center gap-2">
              <span className="font-serif">{avgRating.toFixed(1)}</span>
              <span className="flex text-amber-500 text-[15px] tracking-widest pb-1">
                {ratingStars}
              </span>
            </div>
          }
        />

      </div>
    </div>
  );
}
