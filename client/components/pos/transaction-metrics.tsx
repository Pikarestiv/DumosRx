import React from "react";
import { formatMetricCurrency } from "@/lib/utils";
import { MetricCard } from "@/components/ui/metric-card";

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
  return (
    <div className="flex overflow-x-auto gap-2.5 md:gap-4 md:grid md:grid-cols-4 hide-scrollbar snap-x snap-mandatory">
      <MetricCard
        className="min-w-[180px] md:min-w-0 snap-center shrink-0"
        title="Today's sales"
        value={formatMetricCurrency(metrics.totalSales, currencyCode)}
        valueClassName="font-serif"
      />
      <MetricCard
        className="min-w-[180px] md:min-w-0 snap-center shrink-0"
        title="Transactions"
        value={metrics.transactions}
        valueClassName="font-serif"
      />
      <MetricCard
        className="min-w-[180px] md:min-w-0 snap-center shrink-0"
        title="Refunded"
        value={metrics.refunded}
        valueClassName="font-serif"
      />
      <MetricCard
        className="min-w-[180px] md:min-w-0 snap-center shrink-0"
        title="Avg. basket"
        value={formatMetricCurrency(metrics.avgBasket, currencyCode)}
        valueClassName="font-serif"
      />
    </div>
  );
}
