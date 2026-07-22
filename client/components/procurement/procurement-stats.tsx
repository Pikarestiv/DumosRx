"use client";

import { Card, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { formatCurrency } from "@/lib/utils";

interface ProcurementStatsProps {
  purchaseOrders: any[];
}

export function ProcurementStats({ purchaseOrders }: ProcurementStatsProps) {
  return (
    <div className="-mx-4 sm:mx-0 px-4 sm:px-0 mb-5">
      <div className="flex overflow-x-auto sm:grid sm:grid-cols-3 gap-[10px] sm:gap-4 pb-4 sm:pb-0 hide-scrollbar snap-x snap-mandatory">
        
        <Card className="min-w-[140px] sm:min-w-0 snap-center shrink-0 bg-card border border-border rounded-[14px] p-4 shadow-[0_1px_2px_rgba(16,24,40,0.04),0_1px_3px_rgba(16,24,40,0.03)] border-b-0 border-l-0 border-r-0 sm:border">
          <div className="flex items-center justify-between mb-2">
            <div className="text-[12px] text-muted-foreground font-medium">Open orders</div>
            <div className="w-7 h-7 rounded-lg flex items-center justify-center bg-primary/10 text-primary">
              <svg className="w-3.5 h-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M9 2h6v4H9z"/><rect x="4" y="4" width="16" height="18" rx="2"/><path d="M8 12h8M8 16h5"/></svg>
            </div>
          </div>
          <div className="text-xl font-semibold font-serif tracking-tight">
            {purchaseOrders.filter(p => p.status !== 'received').length}
          </div>
        </Card>

        <Card className="min-w-[140px] sm:min-w-0 snap-center shrink-0 bg-card border border-border rounded-[14px] p-4 shadow-[0_1px_2px_rgba(16,24,40,0.04),0_1px_3px_rgba(16,24,40,0.03)] border-b-0 border-l-0 border-r-0 sm:border">
          <div className="flex items-center justify-between mb-2">
            <div className="text-[12px] text-muted-foreground font-medium">Total procurement value</div>
            <div className="w-7 h-7 rounded-lg flex items-center justify-center bg-emerald-500/10 text-emerald-600">
              <svg className="w-3.5 h-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><rect x="2" y="7" width="20" height="14" rx="2"/><path d="M16 3H8v4h8V3z"/></svg>
            </div>
          </div>
          <div className="text-xl font-semibold font-serif tracking-tight">
            {formatCurrency(purchaseOrders.reduce((sum, p) => sum + p.total_amount, 0))}
          </div>
        </Card>

        <Card className="min-w-[140px] sm:min-w-0 snap-center shrink-0 bg-card border border-border rounded-[14px] p-4 shadow-[0_1px_2px_rgba(16,24,40,0.04),0_1px_3px_rgba(16,24,40,0.03)] border-b-0 border-l-0 border-r-0 sm:border">
          <div className="flex items-center justify-between mb-2">
            <div className="text-[12px] text-muted-foreground font-medium">Active vendors</div>
            <div className="w-7 h-7 rounded-lg flex items-center justify-center bg-muted text-muted-foreground">
              <svg className="w-3.5 h-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M17 21v-2a4 4 0 00-4-4H5a4 4 0 00-4 4v2M9 11a4 4 0 100-8 4 4 0 000 8zM23 21v-2a4 4 0 00-3-3.87M16 3.13a4 4 0 010 7.75"/></svg>
            </div>
          </div>
          <div className="text-xl font-semibold font-serif tracking-tight">
            {new Set(purchaseOrders.map(p => p.vendor_id)).size}
          </div>
        </Card>

      </div>
    </div>
  );
}
