import React from 'react';
import { formatCurrency } from '@/lib/utils';

export function TransactionMetrics({
  metrics,
  currencyCode,
}: {
  metrics: any;
  currencyCode?: string;
}) {
  return (
    <div className="flex overflow-x-auto gap-4 pb-2 px-4 md:mx-0 md:px-0 md:grid md:grid-cols-4 hide-scrollbar snap-x snap-mandatory">
      <MetricCard
        title="Today's sales"
        value={formatCurrency(metrics.totalSales, currencyCode)}
      />
      <MetricCard title="Transactions" value={metrics.transactions} />
      <MetricCard title="Refunded" value={metrics.refunded} />
      <MetricCard
        title="Avg. basket"
        value={formatCurrency(metrics.avgBasket, currencyCode)}
      />
    </div>
  );
}

export function MetricCard({
  title,
  value,
}: {
  title: string;
  value: React.ReactNode;
}) {
  return (
    <div className="bg-card text-card-foreground p-3 shadow-sm border border-border/50 min-w-[130px] shrink-0 md:min-w-0 rounded-xl flex flex-col justify-center snap-start">
      <p className="text-sm text-muted-foreground font-medium mb-1">{title}</p>
      <p className="text-2xl font-bold font-serif">{value}</p>
    </div>
  );
}
