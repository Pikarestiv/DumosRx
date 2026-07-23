"use client";

import { Card } from "@/components/ui/card";
import { 
  PieChart, 
  Pie, 
  Cell, 
  XAxis, 
  YAxis, 
  CartesianGrid, 
  Area, 
  AreaChart 
} from "recharts";
import { 
  ChartContainer, 
  ChartTooltip, 
  ChartTooltipContent 
} from "@/components/ui/chart";
import { useState } from "react";

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
  formattedCategoryData
}: SalesAnalyticsTabProps) {
  const [sortBy, setSortBy] = useState<"revenue" | "quantity">("revenue");
  const products = (sortBy === "revenue" ? topSellingProducts?.revenue : topSellingProducts?.quantity) || [];
  
  return (
    <div className="grid grid-cols-1 lg:grid-cols-[1fr_1.5fr] gap-5">
      {/* Sales by Category */}
      <Card className="p-5 border shadow-sm rounded-2xl">
        <div className="flex items-center gap-2 mb-0.5">
          <svg className="w-4 h-4 text-primary" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M12 20V10M18 20V4M6 20v-4"/></svg>
          <div className="text-[14.5px] font-semibold">Sales by Category</div>
        </div>
        <div className="text-[12px] text-muted-foreground mb-5">Revenue distribution across product categories</div>
        
        <div className="flex items-center justify-center h-[180px] mb-4">
          <ChartContainer config={{ value: { label: "Percentage" } }} className="h-full w-full max-w-[200px]">
            <PieChart>
              <Pie
                data={formattedCategoryData}
                cx="50%"
                cy="50%"
                innerRadius={50}
                outerRadius={80}
                dataKey="value"
                paddingAngle={2}
                labelLine={false}
              >
                {formattedCategoryData.map((entry, index) => (
                  <Cell key={`cell-${index}`} fill={entry.color} />
                ))}
              </Pie>
              <ChartTooltip content={<ChartTooltipContent />} />
            </PieChart>
          </ChartContainer>
        </div>
        
        <div className="flex flex-col gap-3.5">
          {formattedCategoryData.map((category, index) => (
            <div key={index} className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <div className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: category.color }}></div>
                <div className="text-[12px] text-muted-foreground">{category.name}</div>
              </div>
              <div className="text-[12.5px] font-semibold">{category.value}%</div>
            </div>
          ))}
        </div>
      </Card>

      <div className="flex flex-col gap-5">
        {/* Revenue Trend */}
        <Card className="p-5 border shadow-sm rounded-2xl">
          <div className="text-[14.5px] font-semibold mb-0.5">Revenue Trend</div>
          <div className="text-[12px] text-muted-foreground mb-5">Monthly revenue and profit analysis</div>
          
          <div className="h-[180px] w-full">
            <ChartContainer
              config={{
                revenue: { label: "Revenue", color: "#0ea5e9" },
                profit: { label: "Profit", color: "#10b981" },
              }}
              className="h-full w-full"
            >
              <AreaChart data={monthlySalesData}>
                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#e2e8f0" />
                <XAxis 
                  dataKey="month" 
                  axisLine={false} 
                  tickLine={false} 
                  tick={{fill: '#94a3b8', fontSize: 11}} 
                />
                <YAxis
                  axisLine={false} 
                  tickLine={false} 
                  tick={{fill: '#94a3b8', fontSize: 11}}
                  tickFormatter={(value) => `₦${(value / 1000).toFixed(0)}k`}
                />
                <ChartTooltip content={<ChartTooltipContent />} />
                <Area
                  type="monotone"
                  dataKey="revenue"
                  stroke="#0ea5e9"
                  strokeWidth={2}
                  fill="#0ea5e9"
                  fillOpacity={0.1}
                />
                <Area
                  type="monotone"
                  dataKey="profit"
                  stroke="#10b981"
                  strokeWidth={2}
                  fill="#10b981"
                  fillOpacity={0.1}
                />
              </AreaChart>
            </ChartContainer>
          </div>
        </Card>

        {/* Top Selling Products */}
        <Card className="p-5 border shadow-sm rounded-2xl">
          <div className="flex items-center justify-between mb-5">
            <div>
              <div className="text-[14.5px] font-semibold">Top Selling Products</div>
              <div className="text-[12px] text-muted-foreground">Best performing products by {sortBy}</div>
            </div>
            <div className="flex gap-1 bg-secondary p-1 rounded-lg">
              <button
                onClick={() => setSortBy("revenue")}
                className={`px-3 py-1 rounded text-[12px] font-medium transition-all ${
                  sortBy === "revenue" ? "bg-background shadow-sm font-semibold" : "text-muted-foreground"
                }`}
              >
                Revenue
              </button>
              <button
                onClick={() => setSortBy("quantity")}
                className={`px-3 py-1 rounded text-[12px] font-medium transition-all ${
                  sortBy === "quantity" ? "bg-background shadow-sm font-semibold" : "text-muted-foreground"
                }`}
              >
                Quantity
              </button>
            </div>
          </div>
          
          <div className="flex flex-col gap-0">
            {products.length === 0 && (
              <div className="text-center py-8 text-[13px] text-muted-foreground">
                No sales data available for this period.
              </div>
            )}
            {products.length > 0 && products.map((product, index) => (
              <div key={product.name} className="flex items-center justify-between py-3 border-b border-border/50 last:border-0">
                <div className="flex items-center gap-3">
                  <div className="w-8 h-8 rounded-full bg-primary/10 flex items-center justify-center text-[12px] font-semibold text-primary">
                    {index + 1}
                  </div>
                  <div>
                    <div className="text-[13.5px] font-semibold">{product.name}</div>
                    <div className="text-[11px] text-muted-foreground">{product.category}</div>
                  </div>
                </div>
                <div className="text-right">
                  <div className="text-[13.5px] font-semibold">₦{product.sales.toLocaleString()}</div>
                  <div className="text-[11px] text-muted-foreground">{product.units} units</div>
                </div>
              </div>
            ))}
          </div>
        </Card>
      </div>
    </div>
  );
}
