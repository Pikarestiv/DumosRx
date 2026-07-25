import React from 'react';
import { formatCurrency } from '@/lib/utils';
import { MetricCard } from '@/components/ui/metric-card';

export function TransactionMetrics({
  metrics,
  currencyCode,
}: {
  metrics: any;
  currencyCode?: string;
}) {
  return (
    <div className="flex overflow-x-auto gap-[10px] md:gap-4 pb-4 md:pb-0 px-4 md:mx-0 md:px-0 md:grid md:grid-cols-4 hide-scrollbar snap-x snap-mandatory">
      <MetricCard
        className="min-w-[180px] md:min-w-0 snap-center shrink-0"
        title="Today's sales"
        value={formatCurrency(metrics.totalSales, currencyCode)}
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
        value={formatCurrency(metrics.avgBasket, currencyCode)}
        valueClassName="font-serif"
      />
    </div>
  );
}
