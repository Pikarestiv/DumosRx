import React from "react";
import { formatMetricCurrency } from "@/lib/utils";
import { MetricCard } from "@/components/ui/metric-card";
import { useAuth } from "@/lib/context/auth-context";

interface TransactionMetricsData {
  totalSales: number;
  transactions: number;
  refunded: number;
  avgBasket: number;
}

export function TransactionMetrics({
  metrics,
  currencyCode,
}: {
  metrics: TransactionMetricsData;
  currencyCode?: string;
}) {
  const { user } = useAuth();
  const isCashier = user?.role === "sales_staff";

  return (
    <div
      className={`flex overflow-x-auto gap-2.5 md:gap-4 md:grid hide-scrollbar snap-x snap-mandatory ${isCashier ? "md:grid-cols-3" : "md:grid-cols-4"}`}
    >
      <MetricCard
        className="min-w-[180px] md:min-w-0 snap-center shrink-0"
        title="Today's sales"
        value={formatMetricCurrency(metrics.totalSales, currencyCode)}
        valueClassName="font-serif"
      />
      <MetricCard
        className="min-w-[180px] md:min-w-0 snap-center shrink-0"
        title="Today's transactions"
        value={metrics.transactions}
        valueClassName="font-serif"
      />
      <MetricCard
        className="min-w-[180px] md:min-w-0 snap-center shrink-0"
        title="Today's refunds"
        value={metrics.refunded}
        valueClassName="font-serif"
      />
      {!isCashier && (
        <MetricCard
          className="min-w-[180px] md:min-w-0 snap-center shrink-0"
          title="Today's avg. basket"
          value={formatMetricCurrency(metrics.avgBasket, currencyCode)}
          valueClassName="font-serif"
        />
      )}
    </div>
  );
}
