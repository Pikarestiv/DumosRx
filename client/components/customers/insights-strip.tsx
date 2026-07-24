"use client";

import { CustomerMetrics } from "@/lib/hooks/use-customer-data";
import { MetricCard } from "@/components/ui/metric-card";

export function InsightsStrip({
  metrics,
}: {
  metrics: CustomerMetrics | null;
}) {
  if (!metrics) return null;

  return (
    <div className="grid grid-cols-2 md:grid-cols-4 gap-[10px] sm:gap-4">
      <MetricCard
        className="border-border"
        title="Total Customers"
        value={metrics.totalCustomers.toLocaleString()}
        description="in database"
        valueClassName="font-serif"
      />
      <MetricCard
        className="border-border"
        title="Loyalty Members"
        value={metrics.loyaltyMembers.toLocaleString()}
        description="with loyalty points"
        valueClassName="font-serif"
      />
      <MetricCard
        className="border-border"
        title="Total Points"
        value={metrics.totalPoints.toLocaleString()}
        description="accumulated"
        valueClassName="font-serif text-emerald-600"
      />
      <MetricCard
        className="border-border"
        title="Avg Points / Member"
        value={metrics.avgPoints.toLocaleString()}
        description="per customer"
        valueClassName="font-serif"
      />
    </div>
  );
}
