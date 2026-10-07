"use client";

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { TrendChart } from "./trend-chart";
import type { TrendSeries } from "@/lib/types/admin";

interface CashCollectedChartProps {
  series?: TrendSeries;
  granularity: "day" | "month";
}

/**
 * One line per currency and no combined total: this system holds no exchange
 * rate, so a summed line would be a number nobody could act on. See the
 * Phase 4 spec, Part 1.
 */
export function CashCollectedChart({ series, granularity }: CashCollectedChartProps) {
  const currencies = series?.currencies ?? [];

  // No currencies means no lines, which would render an empty grid that reads
  // as "broken" rather than "nothing was collected".
  if (series && series.points.length > 0 && currencies.length === 0) {
    return (
      <Card className="bg-white dark:bg-slate-900 border-slate-200 dark:border-slate-800 shadow-sm">
        <CardHeader>
          <CardTitle className="text-base">Cash collected</CardTitle>
          <CardDescription>Successful payments only.</CardDescription>
        </CardHeader>
        <CardContent>
          <p className="text-sm font-medium text-muted-foreground">
            No payments recorded in this window.
          </p>
        </CardContent>
      </Card>
    );
  }

  return (
    <TrendChart
      title="Cash collected"
      description={
        currencies.length > 1
          ? `Successful payments, one line per currency (${currencies.join(", ")}). Never summed across currencies.`
          : "Successful payments only. This is cash received, not recurring revenue."
      }
      series={series}
      granularity={granularity}
      valueKeys={currencies}
      formatValue={(value) => new Intl.NumberFormat("en-NG").format(value)}
    />
  );
}
