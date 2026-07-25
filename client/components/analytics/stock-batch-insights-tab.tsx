"use client";

import { CheckCircle2 } from "lucide-react";
import { Card } from "@/components/ui/card";
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
  unit?: string;
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
    if (severity === "critical") return "bg-red-100 text-red-700";
    if (severity === "high") return "bg-orange-100 text-orange-700";
    return "bg-gray-100 text-gray-700";
  };

  return (
    <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
      {/* StockBatch Alerts */}
      <Card className="p-5 border shadow-sm rounded-2xl">
        <div>
          <div className="flex items-center gap-2 mb-0.5 text-destructive">
            <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0zM12 9v4m0 4h.01"/></svg>
            <div className="text-[14.5px] font-semibold">Critical Stock Batch Alerts</div>
          </div>
          <div className="text-[12px] text-muted-foreground">Items requiring immediate restocking or checking</div>
        </div>

        {stock_batchAlerts.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-10 text-muted-foreground">
            <CheckCircle2 className="h-10 w-10 text-emerald-500 mb-3 opacity-70" />
            <p className="font-semibold text-[13.5px] text-foreground">All clear!</p>
            <p className="text-[12px] mt-1">No low stock or expiring items found.</p>
          </div>
        ) : (
          <div className="flex flex-col gap-3">
            {stock_batchAlerts.map((alert, idx) => (
              <div
                key={`${alert.product}-${idx}`}
                className="flex items-start justify-between p-3 rounded-lg bg-red-50/50 border border-red-100/50"
              >
                <div>
                  <p className="font-semibold text-red-900 text-[13.5px]">
                    {alert.product}
                  </p>
                  <p className="text-[12px] text-red-700 mt-0.5">
                    {alert.issue}
                    {alert.quantity !== undefined &&
                      ` — ${alert.quantity} ${alert.unit || "unit"}(s) in stock (min: ${alert.threshold} ${alert.unit || "unit"}(s))`}
                    {alert.daysLeft !== undefined && ` — ${alert.daysLeft} day${alert.daysLeft !== 1 ? "s" : ""} left`}
                  </p>
                </div>
                <div className={`shrink-0 text-[10px] uppercase font-bold px-2 py-1 rounded-md ${getSeverityVariant(alert.severity)}`}>
                  {alert.severity}
                </div>
              </div>
            ))}
          </div>
        )}
      </Card>

      {/* Sales by Category */}
      <Card className="p-5 border shadow-sm rounded-2xl">
        <div>
          <div className="text-[14.5px] font-semibold mb-0.5">Sales by Category</div>
          <div className="text-[12px] text-muted-foreground">Distribution of sales across product categories</div>
        </div>

        {salesByCategory.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-[200px] text-muted-foreground">
            <p className="font-semibold text-[13.5px]">No data yet</p>
            <p className="text-[12px] mt-1">Record some sales to see category breakdown.</p>
          </div>
        ) : (
          <div className="h-[200px] w-full">
            <ChartContainer config={chartConfig} className="h-full w-full">
              <BarChart data={salesByCategory}>
                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#e2e8f0" />
                <XAxis
                  dataKey="name"
                  axisLine={false}
                  tickLine={false}
                  tick={{fill: '#94a3b8', fontSize: 11}}
                  tickFormatter={(value) => value.length > 10 ? `${value.substring(0, 10)}...` : value}
                />
                <YAxis
                  axisLine={false}
                  tickLine={false}
                  tick={{fill: '#94a3b8', fontSize: 11}}
                />
                <ChartTooltip content={<ChartTooltipContent />} />
                <Bar dataKey="value" fill="#2054E0" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ChartContainer>
          </div>
        )}
      </Card>
    </div>
  );
}
