"use client";

import { Card, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { formatCurrency } from "@/lib/utils";

interface ProcurementStatsProps {
  purchaseOrders: any[];
}

export function ProcurementStats({ purchaseOrders }: ProcurementStatsProps) {
  return (
    <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
      <Card className="bg-primary/5 border-primary/10">
        <CardHeader className="pb-2">
          <CardDescription>Open Orders</CardDescription>
          <CardTitle className="text-2xl">{purchaseOrders.filter(p => p.status !== 'received').length}</CardTitle>
        </CardHeader>
      </Card>
      <Card className="bg-emerald-500/5 border-emerald-500/10">
        <CardHeader className="pb-2">
          <CardDescription>Total Procurement Value</CardDescription>
          <CardTitle className="text-2xl">{formatCurrency(purchaseOrders.reduce((sum, p) => sum + p.total_amount, 0))}</CardTitle>
        </CardHeader>
      </Card>
      <Card className="bg-blue-500/5 border-blue-500/10">
        <CardHeader className="pb-2">
          <CardDescription>Active Vendors</CardDescription>
          <CardTitle className="text-2xl">{new Set(purchaseOrders.map(p => p.vendor_id)).size}</CardTitle>
        </CardHeader>
      </Card>
    </div>
  );
}
