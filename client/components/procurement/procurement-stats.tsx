"use client";

import { Card, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { formatCurrency } from "@/lib/utils";

interface ProcurementStatsProps {
  purchaseOrders: any[];
}

export function ProcurementStats({ purchaseOrders }: ProcurementStatsProps) {
  return (
    <div className="-mx-4 sm:mx-0 px-4 sm:px-0">
      <div className="flex overflow-x-auto sm:grid sm:grid-cols-3 gap-[10px] sm:gap-4 pb-4 sm:pb-0 hide-scrollbar snap-x snap-mandatory">
        <Card className="min-w-[140px] sm:min-w-0 snap-center shrink-0 bg-primary/5 border-primary/10">
          <CardHeader className="pb-2">
            <CardDescription className="text-xs sm:text-sm">Open Orders</CardDescription>
            <CardTitle className="text-xl sm:text-2xl">{purchaseOrders.filter(p => p.status !== 'received').length}</CardTitle>
          </CardHeader>
        </Card>
        <Card className="min-w-[140px] sm:min-w-0 snap-center shrink-0 bg-emerald-500/5 border-emerald-500/10">
          <CardHeader className="pb-2">
            <CardDescription className="text-xs sm:text-sm">Total Procurement Value</CardDescription>
            <CardTitle className="text-xl sm:text-2xl">{formatCurrency(purchaseOrders.reduce((sum, p) => sum + p.total_amount, 0))}</CardTitle>
          </CardHeader>
        </Card>
        <Card className="min-w-[140px] sm:min-w-0 snap-center shrink-0 bg-blue-500/5 border-blue-500/10">
          <CardHeader className="pb-2">
            <CardDescription className="text-xs sm:text-sm">Active Vendors</CardDescription>
            <CardTitle className="text-xl sm:text-2xl">{new Set(purchaseOrders.map(p => p.vendor_id)).size}</CardTitle>
          </CardHeader>
        </Card>
      </div>
    </div>
  );
}
