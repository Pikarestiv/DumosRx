"use client";

import { 
  Card, 
  CardContent, 
  CardDescription, 
  CardHeader, 
  CardTitle 
} from "@/components/ui/card";
import { 
  Calculator, 
  ArrowDownRight, 
  PieChart as PieChartIcon 
} from "lucide-react";
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
  ChartConfig,
  ChartContainer,
  ChartTooltip, 
  ChartTooltipContent 
} from "@/components/ui/chart";
import { formatCurrency } from "@/lib/utils";

interface ProfitLossTabProps {
  totalRevenue: number;
  totalCogs: number;
  totalExpenses: number;
  grossProfit: number;
  netProfit: number;
  monthlySalesData: any[];
}

const chartConfig = {
  profit: {
    label: "Net Profit",
    color: "#10b981",
  },
  expenses: {
    label: "Operating Exp.",
    color: "#f59e0b",
  },
  cogs: {
    label: "Stock Batch Cost",
    color: "#0ea5e9",
  },
} satisfies ChartConfig;

export function ProfitLossTab({
  totalRevenue,
  totalCogs,
  totalExpenses,
  grossProfit,
  netProfit,
  monthlySalesData
}: ProfitLossTabProps) {
  return (
    <div className="grid grid-cols-1 lg:grid-cols-[1.4fr_1fr] gap-5">
      <div className="bg-background border rounded-2xl p-5">
        <div className="flex items-center gap-2 mb-0.5">
          <Calculator className="w-4 h-4 text-primary" />
          <div className="text-[14.5px] font-semibold">Financial Performance Statement</div>
        </div>
        <div className="text-[12px] text-muted-foreground mb-5">Detailed breakdown of income and operational costs</div>
        
        <div className="flex items-center justify-between py-3 border-b text-[13.5px]">
          <div>Total Gross Revenue</div>
          <div className="font-semibold">{formatCurrency(totalRevenue)}</div>
        </div>
        <div className="flex items-center justify-between py-3 border-b text-[13.5px] text-destructive italic">
          <div className="flex items-center gap-1"><ArrowDownRight className="w-3.5 h-3.5" /> Cost of Goods Sold (COGS)</div>
          <div className="font-semibold">− {formatCurrency(totalCogs)}</div>
        </div>
        <div className="flex items-center justify-between py-3 bg-primary/5 px-3 rounded-lg my-2 text-[13.5px] font-bold text-primary">
          <div>GROSS PROFIT</div>
          <div>{formatCurrency(grossProfit)}</div>
        </div>
        <div className="flex items-center justify-between py-3 border-b text-[13.5px] text-destructive italic">
          <div className="flex items-center gap-1"><ArrowDownRight className="w-3.5 h-3.5" /> Total Operational Expenses</div>
          <div className="font-semibold">− {formatCurrency(totalExpenses)}</div>
        </div>
        
        <div className="bg-emerald-500/10 rounded-xl p-4 mt-3 flex flex-col md:flex-row items-center justify-between gap-4">
          <div>
            <div className="text-[11px] font-bold text-emerald-600 uppercase tracking-wide">Final Net Income (Take Home)</div>
            <div className="text-[24px] font-bold font-['Playfair_Display'] text-emerald-600">{formatCurrency(netProfit)}</div>
          </div>
          <div className="bg-background border rounded-xl px-4 py-2.5 text-center shadow-sm">
            <div className="text-[10px] font-semibold text-muted-foreground uppercase">Net Margin</div>
            <div className="text-[19px] font-bold font-['Playfair_Display']">
              {totalRevenue > 0 ? ((netProfit / totalRevenue) * 100).toFixed(0) : 0}%
            </div>
          </div>
        </div>
      </div>

      <div className="bg-background border rounded-2xl p-5">
        <div className="flex items-center gap-2 mb-5">
          <PieChartIcon className="w-4 h-4 text-primary" />
          <div className="text-[13.5px] font-bold uppercase tracking-wide">Burn Distribution</div>
        </div>
        <div className="h-[180px] w-full mb-4">
          <ChartContainer config={chartConfig} className="h-full w-full">
            <PieChart>
              <Pie
                data={[
                  { name: 'COGS', value: totalCogs },
                  { name: 'Expenses', value: totalExpenses },
                  { name: 'Net Profit', value: Math.max(0, netProfit) }
                ]}
                cx="50%"
                cy="50%"
                innerRadius={50}
                outerRadius={70}
                paddingAngle={5}
                dataKey="value"
              >
                <Cell key="cell-0" fill="#0ea5e9" className="stroke-transparent" />
                <Cell key="cell-1" fill="#f59e0b" className="stroke-transparent" />
                <Cell key="cell-2" fill="#10b981" className="stroke-transparent" />
              </Pie>
              <ChartTooltip content={<ChartTooltipContent />} />
            </PieChart>
          </ChartContainer>
        </div>
        <div className="flex flex-col gap-3.5">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <div className="w-2.5 h-2.5 rounded-full bg-sky-500"></div>
              <div className="text-[12px] text-muted-foreground">Stock Batch Cost</div>
            </div>
            <div className="text-[12.5px] font-semibold">{totalRevenue > 0 ? ((totalCogs / totalRevenue) * 100).toFixed(0) : 0}%</div>
          </div>
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <div className="w-2.5 h-2.5 rounded-full bg-amber-500"></div>
              <div className="text-[12px] text-muted-foreground">Operating Exp.</div>
            </div>
            <div className="text-[12.5px] font-semibold">{totalRevenue > 0 ? ((totalExpenses / totalRevenue) * 100).toFixed(0) : 0}%</div>
          </div>
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <div className="w-2.5 h-2.5 rounded-full bg-emerald-500"></div>
              <div className="text-[12px] font-semibold text-emerald-600">NET PROFIT</div>
            </div>
            <div className="text-[12.5px] font-bold text-emerald-600">{totalRevenue > 0 ? ((netProfit / totalRevenue) * 100).toFixed(0) : 0}%</div>
          </div>
        </div>
      </div>

      <div className="bg-background border rounded-2xl p-5 lg:col-span-2">
        <div className="text-[14.5px] font-semibold mb-0.5">Financial Health Over Time</div>
        <div className="text-[12px] text-muted-foreground mb-5">Revenue vs. net profit across recent months</div>
        <div className="h-[180px] w-full">
          <ChartContainer config={chartConfig} className="h-full w-full">
            <AreaChart data={monthlySalesData}>
              <defs>
                <linearGradient id="profitGradient" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor="#10b981" stopOpacity={0.3}/>
                  <stop offset="95%" stopColor="#10b981" stopOpacity={0}/>
                </linearGradient>
              </defs>
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
                tickFormatter={(val) => `₦${val/1000}k`}
              />
              <ChartTooltip content={<ChartTooltipContent />} />
              <Area 
                type="monotone" 
                dataKey="profit" 
                stroke="#10b981" 
                strokeWidth={2}
                fill="url(#profitGradient)" 
                name="Net Profit" 
              />
              <Area 
                type="monotone" 
                dataKey="expenses" 
                stroke="#f59e0b" 
                strokeWidth={2}
                strokeDasharray="5 5"
                fill="transparent" 
                name="Operating Exp." 
              />
            </AreaChart>
          </ChartContainer>
        </div>
      </div>
    </div>
  );
}
