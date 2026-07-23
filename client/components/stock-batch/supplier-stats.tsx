"use client";

import { Card } from "@/components/ui/card";

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
        
        <Card className="min-w-[140px] sm:min-w-0 snap-center shrink-0 bg-card border border-border rounded-[14px] p-[18px] px-5 shadow-sm border-b-0 border-l-0 border-r-0 sm:border">
          <div className="text-[12.5px] text-muted-foreground font-medium mb-3.5">Total suppliers</div>
          <div className="flex items-baseline gap-2">
            <div className="text-2xl font-semibold font-serif tracking-tight">{totalSuppliers}</div>
            <div className="text-[12px] text-primary font-semibold">{activeSuppliers} active</div>
          </div>
        </Card>

        <Card className="min-w-[140px] sm:min-w-0 snap-center shrink-0 bg-card border border-border rounded-[14px] p-[18px] px-5 shadow-sm border-b-0 border-l-0 border-r-0 sm:border">
          <div className="text-[12.5px] text-muted-foreground font-medium mb-3.5">Total purchase value</div>
          <div className="text-2xl font-semibold font-serif tracking-tight">
            {formatCurrency(totalValue)}
          </div>
        </Card>

        <Card className="min-w-[140px] sm:min-w-0 snap-center shrink-0 bg-card border border-border rounded-[14px] p-[18px] px-5 shadow-sm border-b-0 border-l-0 border-r-0 sm:border">
          <div className="text-[12.5px] text-muted-foreground font-medium mb-3.5">Average rating</div>
          <div className="flex items-center gap-2">
            <div className="text-2xl font-semibold font-serif tracking-tight">{avgRating.toFixed(1)}</div>
            <div className="flex text-amber-500 text-[15px] tracking-widest pb-1">
              {ratingStars}
            </div>
          </div>
        </Card>

      </div>
    </div>
  );
}
