"use client";

import { Users, Award, Sparkles, TrendingUp } from "lucide-react";
import { CustomerMetrics } from "@/lib/hooks/use-customer-data";
import { MetricCard } from "@/components/ui/metric-card";

export function InsightsStrip({
  metrics,
}: {
  metrics: CustomerMetrics | null;
}) {
  if (!metrics) return null;

  return (
    <div className="-mx-4 sm:mx-0 px-4 sm:px-0">
      <div className="flex overflow-x-auto sm:grid sm:grid-cols-4 gap-[10px] sm:gap-4 pb-4 sm:pb-0 hide-scrollbar snap-x snap-mandatory">
        <MetricCard
          className="min-w-[160px] sm:min-w-0 snap-center shrink-0 border-border"
          title="Total Customers"
          value={metrics.totalCustomers.toLocaleString()}
          icon={<Users className="h-4 w-4" />}
          iconBgClass="bg-blue-50 text-blue-700"
          description="in database"
          valueClassName="font-serif"
        />
        <MetricCard
          className="min-w-[160px] sm:min-w-0 snap-center shrink-0 border-border"
          title="Loyalty Members"
          value={metrics.loyaltyMembers.toLocaleString()}
          icon={<Award className="h-4 w-4" />}
          iconBgClass="bg-violet-50 text-violet-700"
          description="with loyalty points"
          valueClassName="font-serif"
        />
        <MetricCard
          className="min-w-[160px] sm:min-w-0 snap-center shrink-0 border-emerald-200/50 hover:border-emerald-500/50"
          title="Total Points"
          value={metrics.totalPoints.toLocaleString()}
          icon={<Sparkles className="h-4 w-4" />}
          iconBgClass="bg-emerald-50 text-emerald-700"
          description="accumulated"
          valueClassName="font-serif text-emerald-600"
        />
        <MetricCard
          className="min-w-[160px] sm:min-w-0 snap-center shrink-0 border-border"
          title="Avg Points / Member"
          value={metrics.avgPoints.toLocaleString()}
          icon={<TrendingUp className="h-4 w-4" />}
          iconBgClass="bg-sky-50 text-sky-700"
          description="per customer"
          valueClassName="font-serif"
        />
      </div>
    </div>
  );
}
