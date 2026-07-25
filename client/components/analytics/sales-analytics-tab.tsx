"use client";

import { useMemo, useState } from "react";
import { Card } from "@/components/ui/card";
import { BarChart, Bar, XAxis, YAxis, CartesianGrid } from "recharts";
import {
  ChartContainer,
  ChartTooltip,
  ChartTooltipContent,
} from "@/components/ui/chart";

interface SalesAnalyticsTabProps {
  monthlySalesData: any[];
  topSellingProducts: {
    revenue: any[];
    quantity: any[];
  };
  formattedCategoryData: any[];
}

export function SalesAnalyticsTab({
  monthlySalesData,
  topSellingProducts,
  formattedCategoryData,
}: SalesAnalyticsTabProps) {
  const [sortBy, setSortBy] = useState<"revenue" | "quantity">("revenue");
  const products =
    (sortBy === "revenue"
      ? topSellingProducts?.revenue
      : topSellingProducts?.quantity) || [];

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
                tickFormatter={(value) => `₦${(value / 1000).toFixed(0)}k`}
              />
              <ChartTooltip content={<ChartTooltipContent />} />
              <Bar dataKey="revenue" fill="#2054E0" radius={[4, 4, 0, 0]} />
            </BarChart>
          </ChartContainer>
        </div>
      </Card>

      {/* Top Selling Products */}
      <Card className="p-5 border shadow-sm rounded-2xl">
        <div>
          <div className="flex items-center justify-between mb-0.5">
            <div className="text-[14.5px] font-semibold">
              Top Selling Products
            </div>
            <div className="flex gap-1 bg-muted p-1 rounded-lg">
              <button
                onClick={() => setSortBy("revenue")}
                className={`px-2.5 py-1 rounded-md text-[11.5px] font-semibold transition-all ${
                  sortBy === "revenue"
                    ? "bg-primary text-primary-foreground"
                    : "text-muted-foreground"
                }`}
              >
                Revenue
              </button>
              <button
                onClick={() => setSortBy("quantity")}
                className={`px-2.5 py-1 rounded-md text-[11.5px] font-semibold transition-all ${
                  sortBy === "quantity"
                    ? "bg-primary text-primary-foreground"
                    : "text-muted-foreground"
                }`}
              >
                Quantity
              </button>
            </div>
          </div>
          <div className="text-[12px] text-muted-foreground">
            Best performing products
          </div>
        </div>

        <div className="flex flex-col">
          {products.length === 0 && (
            <div className="text-center py-8 text-[13px] text-muted-foreground">
              No sales data available for this period.
            </div>
          )}
          {products.length > 0 &&
            products.map((product, index) => (
              <div
                key={product.name}
                className="flex items-center gap-3 py-2.5 border-b border-border last:border-0"
              >
                <div className="w-5 text-[12px] font-bold text-muted-foreground">
                  {String(index + 1).padStart(2, "0")}
                </div>
                <div className="flex-1 text-[13px] font-medium truncate">
                  {product.name}
                </div>
                <div className="text-[13px] font-semibold shrink-0">
                  {sortBy === "revenue"
                    ? `₦${product.sales.toLocaleString()}`
                    : `${product.units} units`}
                </div>
              </div>
            ))}
        </div>
      </Card>

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
          <div className="text-center py-8 text-[13px] text-muted-foreground">
            No sales data available for this period.
          </div>
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
