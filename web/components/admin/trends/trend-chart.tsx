"use client";

import {
  CartesianGrid,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { formatDateOnlyToDDMMYYYY } from "@/lib/utils/date-utils";
import type { TrendSeries } from "@/lib/types/admin";

const MONTHS = [
  "Jan", "Feb", "Mar", "Apr", "May", "Jun",
  "Jul", "Aug", "Sep", "Oct", "Nov", "Dec",
];

const SERIES_COLORS = [
  "var(--chart-1)",
  "var(--chart-2)",
  "var(--chart-3)",
  "var(--chart-4)",
  "var(--chart-5)",
];

const UNAVAILABLE = "Trend unavailable";

/**
 * A monthly bucket has no day, so it renders as a month and year rather than
 * inventing one. A daily bucket goes through the date-only formatter, which
 * parses YYYY-MM-DD without the UTC shift that moves a date a day west.
 */
export function formatBucketLabel(bucket: string, granularity: "day" | "month"): string {
  if (granularity === "day") {
    return formatDateOnlyToDDMMYYYY(bucket);
  }

  const parts = /^(\d{4})-(\d{2})$/.exec(bucket);

  if (!parts) {
    return bucket;
  }

  const [, year, month] = parts;

  return `${MONTHS[Number(month) - 1] ?? month} ${year}`;
}

interface TrendChartProps {
  title: string;
  description?: string;
  series?: TrendSeries;
  granularity: "day" | "month";
  valueKeys: string[];
  formatValue?: (value: number) => string;
}

export function TrendChart({
  title,
  description,
  series,
  granularity,
  valueKeys,
  formatValue,
}: TrendChartProps) {
  const points = series?.points ?? [];
  const keys = valueKeys.length > 0 ? valueKeys : ["count"];

  const data = points.map((point) => ({
    label: formatBucketLabel(point.bucket, granularity),
    ...point.values,
  }));

  return (
    <Card className="bg-card border-border shadow-sm">
      <CardHeader>
        <CardTitle className="text-base">{title}</CardTitle>
        {description && <CardDescription>{description}</CardDescription>}
      </CardHeader>
      <CardContent>
        {data.length === 0 ? (
          <p className="text-sm font-medium text-muted-foreground">{UNAVAILABLE}</p>
        ) : (
          <div className="h-64 w-full">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={data} margin={{ top: 8, right: 8, bottom: 8, left: 0 }}>
                <CartesianGrid strokeDasharray="3 3" className="stroke-border" vertical={false} />
                <XAxis
                  dataKey="label"
                  tick={{ fontSize: 11, fill: "var(--muted-foreground)" }}
                  className="fill-muted-foreground"
                  tickLine={false}
                  axisLine={false}
                />
                <YAxis
                  tick={{ fontSize: 11, fill: "var(--muted-foreground)" }}
                  className="fill-muted-foreground"
                  tickLine={false}
                  axisLine={false}
                  width={56}
                  tickFormatter={(value: number) => (formatValue ? formatValue(value) : String(value))}
                />
                <Tooltip
                  contentStyle={{
                    background: "var(--background)",
                    border: "1px solid var(--border)",
                    borderRadius: "0.5rem",
                    fontSize: "0.75rem",
                  }}
                  formatter={(value) =>
                    formatValue ? formatValue(Number(value)) : String(value)
                  }
                />
                {keys.map((key, index) => (
                  <Line
                    key={key}
                    type="monotone"
                    dataKey={key}
                    name={key}
                    stroke={SERIES_COLORS[index % SERIES_COLORS.length]}
                    strokeWidth={2}
                    dot={false}
                  />
                ))}
              </LineChart>
            </ResponsiveContainer>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
