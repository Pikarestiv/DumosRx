"use client";

import { useMemo } from "react";
import { Card } from "@/components/ui/card";
import { PieChart } from "lucide-react";
import { BarChart, Bar, XAxis, YAxis, CartesianGrid } from "recharts";
import {
  ChartContainer,
  ChartTooltip,
  ChartTooltipContent,
} from "@/components/ui/chart";
import type { MonthlySalesDataPoint, CategoryDistributionItem } from "@/lib/types/analytics";
import { getCurrencySymbol } from "@/lib/utils";
import { useStore } from "@/lib/context/store-context";
import { ProductPerformanceTable, type ProductPerformanceRow } from "./product-performance-table";
import { EmptyReportState } from "@/components/reports/empty-report-state";

interface SalesAnalyticsTabProps {
  monthlySalesData: MonthlySalesDataPoint[];
  productPerformance: ProductPerformanceRow[];
  formattedCategoryData: CategoryDistributionItem[];
}

export function SalesAnalyticsTab({
  monthlySalesData,
  productPerformance,
  formattedCategoryData,
}: SalesAnalyticsTabProps) {
  const { storeProfile } = useStore();
  const currencySymbol = getCurrencySymbol(storeProfile?.currency);
  const categoryDistribution = useMemo(() => {
    const total = formattedCategoryData.reduce(
      (sum, c) => sum + (c.value || 0),
      0,
    );
    return formattedCategoryData.map((c) => ({
      ...c,
      percentage: total > 0 ? Math.round((c.value / total) * 100) : 0,
    }));
  }, [formattedCategoryData]);

  return (
    <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
      {/* Revenue Trend */}
      <Card className="p-5 border shadow-sm rounded-2xl">
        <div>
          <div className="text-[14.5px] font-semibold mb-0.5">Revenue Trend</div>
          <div className="text-[12px] text-muted-foreground">
            Monthly revenue analysis
          </div>
        </div>

        <div className="h-[180px] w-full">
          <ChartContainer
            config={{
              revenue: { label: "Revenue", color: "#2054E0" },
            }}
            className="h-full w-full"
          >
            <BarChart data={monthlySalesData}>
              <CartesianGrid
                strokeDasharray="3 3"
                vertical={false}
                stroke="#e2e8f0"
              />
              <XAxis
                dataKey="month"
                axisLine={false}
                tickLine={false}
                tick={{ fill: "#94a3b8", fontSize: 11 }}
              />
              <YAxis
                axisLine={false}
                tickLine={false}
                tick={{ fill: "#94a3b8", fontSize: 11 }}
                tickFormatter={(value) => `${currencySymbol}${(value / 1000).toFixed(0)}k`}
              />
              <ChartTooltip content={<ChartTooltipContent />} />
              <Bar dataKey="revenue" fill="#2054E0" radius={[4, 4, 0, 0]} />
            </BarChart>
          </ChartContainer>
        </div>
      </Card>

      <ProductPerformanceTable products={productPerformance} />

      {/* Sales by Category */}
      <Card className="p-5 border shadow-sm rounded-2xl lg:col-span-2">
        <div>
          <div className="text-[14.5px] font-semibold mb-0.5">
            Sales by Category
          </div>
          <div className="text-[12px] text-muted-foreground">
            Revenue distribution across product categories
          </div>
        </div>

        {categoryDistribution.length === 0 ? (
          <EmptyReportState icon={PieChart} description="No sales data available for the selected filters." />
        ) : (
          <div className="flex flex-col gap-3.5">
            {categoryDistribution.map((category, index) => (
              <div key={index}>
                <div className="flex items-center justify-between mb-1.5">
                  <div className="text-[13px] font-medium">{category.name}</div>
                  <div className="text-[12.5px] font-semibold text-muted-foreground">
                    {category.percentage}%
                  </div>
                </div>
                <div className="h-2 bg-secondary rounded-full overflow-hidden">
                  <div
                    className="h-full rounded-full"
                    style={{
                      width: `${category.percentage}%`,
                      backgroundColor: category.color,
                    }}
                  />
                </div>
              </div>
            ))}
          </div>
        )}
      </Card>
    </div>
  );
}
