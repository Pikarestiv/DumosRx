"use client";

import { Card, CardContent } from "@/components/ui/card";

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
        
        <Card className="min-w-[140px] sm:min-w-0 snap-center shrink-0 bg-card border border-border rounded-[14px] p-[18px] px-5 shadow-[0_1px_2px_rgba(16,24,40,0.04),0_1px_3px_rgba(16,24,40,0.03)] border-b-0 border-l-0 border-r-0 sm:border">
          <div className="flex items-center justify-between mb-3.5">
            <div className="text-[12.5px] text-muted-foreground font-medium">Total suppliers</div>
            <div className="w-8 h-8 rounded-lg flex items-center justify-center bg-primary/10 text-primary">
              <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M17 21v-2a4 4 0 00-4-4H5a4 4 0 00-4 4v2M9 11a4 4 0 100-8 4 4 0 000 8zM23 21v-2a4 4 0 00-3-3.87M16 3.13a4 4 0 010 7.75"/></svg>
            </div>
          </div>
          <div className="text-2xl font-semibold font-serif tracking-tight flex items-end justify-between">
            {totalSuppliers}
            <div className="text-right">
              <span className="text-[11px] text-muted-foreground mr-1.5">Active</span>
              <span className="text-[13px] font-semibold text-primary bg-primary/10 px-2 py-0.5 rounded-full">{activeSuppliers}</span>
            </div>
          </div>
        </Card>

        <Card className="min-w-[140px] sm:min-w-0 snap-center shrink-0 bg-card border border-border rounded-[14px] p-[18px] px-5 shadow-[0_1px_2px_rgba(16,24,40,0.04),0_1px_3px_rgba(16,24,40,0.03)] border-b-0 border-l-0 border-r-0 sm:border">
          <div className="flex items-center justify-between mb-3.5">
            <div className="text-[12.5px] text-muted-foreground font-medium">Total purchase value</div>
            <div className="w-8 h-8 rounded-lg flex items-center justify-center bg-emerald-500/10 text-emerald-600">
              <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><rect x="2" y="7" width="20" height="14" rx="2"/><path d="M16 3H8v4h8V3z"/></svg>
            </div>
          </div>
          <div className="text-2xl font-semibold font-serif tracking-tight">
            {formatCurrency(totalValue)}
          </div>
        </Card>

        <Card className="min-w-[140px] sm:min-w-0 snap-center shrink-0 bg-card border border-border rounded-[14px] p-[18px] px-5 shadow-[0_1px_2px_rgba(16,24,40,0.04),0_1px_3px_rgba(16,24,40,0.03)] border-b-0 border-l-0 border-r-0 sm:border">
          <div className="flex items-center justify-between mb-3.5">
            <div className="text-[12.5px] text-muted-foreground font-medium">Average rating</div>
            <div className="w-8 h-8 rounded-lg flex items-center justify-center bg-amber-500/10 text-amber-600">
              <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"/></svg>
            </div>
          </div>
          <div className="text-2xl font-semibold font-serif tracking-tight flex items-end justify-between">
            {avgRating.toFixed(1)}
            <div className="text-right text-amber-500 text-[15px] tracking-widest pb-1">
              {ratingStars}
            </div>
          </div>
        </Card>

      </div>
    </div>
  );
}
