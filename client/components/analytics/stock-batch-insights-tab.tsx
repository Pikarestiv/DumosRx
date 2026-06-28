"use client";

import { 
  Card, 
  CardContent, 
  CardDescription, 
  CardHeader, 
  CardTitle 
} from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { AlertTriangle, CheckCircle2 } from "lucide-react";
import { 
  BarChart, 
  Bar, 
  XAxis, 
  YAxis, 
  CartesianGrid 
} from "recharts";
import { 
  ChartConfig,
  ChartContainer,
  ChartTooltip,
  ChartTooltipContent
} from "@/components/ui/chart";

const chartConfig = {
  stock_batch: {
    label: "Stock Batch Level",
    color: "#0ea5e9",
  },
} satisfies ChartConfig;

interface StockBatchAlert {
  product: string;
  issue: string;
  severity: string;
  quantity?: number;
  threshold?: number;
  expiryDate?: string;
  daysLeft?: number;
}

interface StockBatchInsightsTabProps {
  stock_batchAlerts: StockBatchAlert[];
  salesByCategory: any[];
}

export function StockBatchInsightsTab({
  stock_batchAlerts,
  salesByCategory
}: StockBatchInsightsTabProps) {
  const getSeverityVariant = (severity: string) => {
    if (severity === "critical") return "destructive";
    if (severity === "high") return "secondary";
    return "outline";
  };

  return (
    <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
      {/* StockBatch Alerts */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-red-600">
            <AlertTriangle className="h-5 w-5" />
            Stock Batch Alerts
          </CardTitle>
          <CardDescription>
            Critical issues requiring immediate attention
          </CardDescription>
        </CardHeader>
        <CardContent>
          {stock_batchAlerts.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-10 text-muted-foreground">
              <CheckCircle2 className="h-10 w-10 text-emerald-500 mb-3 opacity-70" />
              <p className="font-semibold text-foreground">All clear!</p>
              <p className="text-sm mt-1">No low stock or expiring items found.</p>
            </div>
          ) : (
            <div className="space-y-3">
              {stock_batchAlerts.map((alert, idx) => (
                <div
                  key={`${alert.product}-${idx}`}
                  className="flex items-start justify-between p-3 rounded-lg bg-red-50 dark:bg-red-950/20 border border-red-100 dark:border-red-900/30"
                >
                  <div>
                    <p className="font-semibold text-red-900 dark:text-red-200 text-sm">
                      {alert.product}
                    </p>
                    <p className="text-xs text-red-700 dark:text-red-400 mt-0.5">
                      {alert.issue}
                      {alert.quantity !== undefined && ` — ${alert.quantity} in stock (min: ${alert.threshold})`}
                      {alert.daysLeft !== undefined && ` — ${alert.daysLeft} day${alert.daysLeft !== 1 ? "s" : ""} left`}
                    </p>
                  </div>
                  <Badge variant={getSeverityVariant(alert.severity)} className="ml-3 shrink-0 text-[10px] uppercase font-black">
                    {alert.severity}
                  </Badge>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Stock Levels by Category */}
      <Card>
        <CardHeader>
          <CardTitle>Sales by Category</CardTitle>
          <CardDescription>
            Distribution of sales across product categories
          </CardDescription>
        </CardHeader>
        <CardContent>
          {salesByCategory.length === 0 ? (
            <div className="flex flex-col items-center justify-center h-80 text-muted-foreground">
              <p className="font-semibold">No data yet</p>
              <p className="text-sm mt-1">Record some sales to see category breakdown.</p>
            </div>
          ) : (
            <div className="h-80">
              <ChartContainer config={chartConfig} className="h-full w-full">
                <BarChart data={salesByCategory}>
                  <CartesianGrid strokeDasharray="3 3" />
                  <XAxis 
                    dataKey="name" 
                    tick={{ fontSize: 11 }} 
                    tickFormatter={(value) => value.length > 10 ? `${value.substring(0, 10)}...` : value}
                  />
                  <YAxis />
                  <ChartTooltip content={<ChartTooltipContent />} />
                  <Bar dataKey="value" fill="#0ea5e9" radius={[4, 4, 0, 0]} />
                </BarChart>
              </ChartContainer>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
