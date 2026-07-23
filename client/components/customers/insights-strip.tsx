"use client";

import { CustomerMetrics } from "@/lib/hooks/use-customer-data";

export function InsightsStrip({ metrics }: { metrics: CustomerMetrics | null }) {
  if (!metrics) return null;

  return (
    <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
      <div className="bg-background border rounded-[14px] p-4 flex flex-col justify-center shadow-sm">
        <div className="text-[12px] text-muted-foreground font-medium mb-1">Total Customers</div>
        <div className="text-[20px] font-bold text-foreground">
          {metrics.totalCustomers.toLocaleString()}
        </div>
      </div>
      <div className="bg-background border rounded-[14px] p-4 flex flex-col justify-center shadow-sm">
        <div className="text-[12px] text-muted-foreground font-medium mb-1">Loyalty Members</div>
        <div className="text-[20px] font-bold text-foreground">
          {metrics.loyaltyMembers.toLocaleString()}
        </div>
      </div>
      <div className="bg-background border rounded-[14px] p-4 flex flex-col justify-center shadow-sm">
        <div className="text-[12px] text-muted-foreground font-medium mb-1">Total Points</div>
        <div className="text-[20px] font-bold text-emerald-600">
          {metrics.totalPoints.toLocaleString()}
        </div>
      </div>
      <div className="bg-background border rounded-[14px] p-4 flex flex-col justify-center shadow-sm">
        <div className="text-[12px] text-muted-foreground font-medium mb-1">Avg Points / Member</div>
        <div className="text-[20px] font-bold text-foreground">
          {metrics.avgPoints.toLocaleString()}
        </div>
      </div>
    </div>
  );
}
