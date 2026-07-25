"use client";

import { format } from "date-fns";
import { formatCurrency } from "@/lib/utils";
import { MetricCard } from "@/components/ui/metric-card";

interface ExpenseInsightsStripProps {
  totalExpenses: number;
  thisMonthExpenses: number;
  topCategoryStr: string;
  transactionCount: number;
  currencyCode?: string;
}

export function ExpenseInsightsStrip({
  totalExpenses,
  thisMonthExpenses,
  topCategoryStr,
  transactionCount,
  currencyCode,
}: ExpenseInsightsStripProps) {
  return (
    <div className="flex overflow-x-auto sm:grid sm:grid-cols-2 lg:grid-cols-4 gap-[10px] sm:gap-4 hide-scrollbar snap-x snap-mandatory mb-4">
      <MetricCard
        className="min-w-[180px] sm:min-w-0 shrink-0 snap-start border-border"
        title="Total expenses"
        value={formatCurrency(totalExpenses, currencyCode || "NGN")}
        valueClassName="font-serif"
        icon={
          <svg
            className="w-4 h-4"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
          >
            <rect x="2" y="7" width="20" height="14" rx="2" />
            <path d="M16 3H8v4h8V3z" />
          </svg>
        }
        iconBgClass="bg-primary/10 text-primary"
        description={<span className="hidden sm:inline">all time</span>}
      />

      <MetricCard
        className="min-w-[180px] sm:min-w-0 shrink-0 snap-start border-border"
        title="This month"
        value={formatCurrency(thisMonthExpenses, currencyCode || "NGN")}
        valueClassName="font-serif"
        icon={
          <svg
            className="w-4 h-4"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
          >
            <rect x="3" y="4" width="18" height="18" rx="2" />
            <path d="M16 2v4M8 2v4M3 10h18" />
          </svg>
        }
        iconBgClass="bg-chart-1/10 text-chart-1"
        description={
          <span className="hidden sm:inline">
            {format(new Date(), "MMMM yyyy")}
          </span>
        }
      />

      <MetricCard
        className="min-w-[180px] sm:min-w-0 shrink-0 snap-start border-border"
        title="Top category"
        value={topCategoryStr}
        valueClassName="font-serif truncate"
        icon={
          <svg
            className="w-4 h-4"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
          >
            <path d="M3 3v18h18" />
            <path d="M7 15l4-6 3 4 4-7" />
          </svg>
        }
        iconBgClass="bg-muted text-muted-foreground"
        description={
          <span className="hidden sm:inline">highest spend this month</span>
        }
      />

      <MetricCard
        className="min-w-[180px] sm:min-w-0 shrink-0 snap-start border-border"
        title="Transactions"
        value={transactionCount}
        valueClassName="font-serif"
        icon={
          <svg
            className="w-4 h-4"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
          >
            <path d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2" />
            <rect x="9" y="3" width="6" height="4" rx="1" />
          </svg>
        }
        iconBgClass="bg-muted text-muted-foreground"
        description={<span className="hidden sm:inline">recorded all time</span>}
      />
    </div>
  );
}
