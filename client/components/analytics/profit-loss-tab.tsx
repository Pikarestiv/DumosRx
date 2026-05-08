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
  ResponsiveContainer, 
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
    label: "Inventory Cost",
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
    <div className="space-y-6">
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <Card className="lg:col-span-2">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-xl font-bold">
              <Calculator className="h-5 w-5 text-primary" />
              Financial Performance Statement
            </CardTitle>
            <CardDescription>
              Detailed breakdown of income and operational costs
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-8">
            <div className="space-y-4">
              <div className="flex justify-between items-center pb-2 border-b">
                <span className="text-muted-foreground font-medium">Total Gross Revenue</span>
                <span className="font-bold text-lg">{formatCurrency(totalRevenue)}</span>
              </div>
              <div className="flex justify-between items-center pb-2 border-b text-destructive">
                <span className="flex items-center gap-2 italic">
                  <ArrowDownRight className="h-4 w-4" />
                  Cost of Goods Sold (COGS)
                </span>
                <span className="font-bold italic">- {formatCurrency(totalCogs)}</span>
              </div>
              <div className="flex justify-between items-center py-3 bg-primary/5 px-4 rounded-xl font-bold border border-primary/10">
                <span className="text-primary uppercase tracking-wider text-xs">Gross Profit</span>
                <span className="text-primary text-xl">{formatCurrency(grossProfit)}</span>
              </div>
              <div className="flex justify-between items-center pb-2 border-b text-destructive/80">
                <span className="flex items-center gap-2 italic">
                  <ArrowDownRight className="h-4 w-4" />
                  Total Operational Expenses
                </span>
                <span className="font-bold italic">- {formatCurrency(totalExpenses)}</span>
              </div>
            </div>

            <div className="p-8 bg-emerald-500/10 rounded-3xl border border-emerald-500/20 flex flex-col md:flex-row justify-between items-center gap-6">
              <div>
                <h4 className="text-emerald-700 font-bold uppercase tracking-widest text-[10px] mb-1">Final Net Income (Take Home)</h4>
                <p className="text-4xl font-serif font-black text-emerald-600">{formatCurrency(netProfit)}</p>
              </div>
              <div className="text-center md:text-right bg-white/50 backdrop-blur-sm px-6 py-4 rounded-2xl border border-emerald-500/10">
                <h4 className="text-muted-foreground font-bold uppercase tracking-widest text-[10px] mb-1">Net Margin %</h4>
                <p className="text-3xl font-serif font-bold text-emerald-700">
                  {totalRevenue > 0 ? ((netProfit / totalRevenue) * 100).toFixed(1) : 0}%
                </p>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card className="border-accent/10">
          <CardHeader>
            <CardTitle className="text-sm font-bold flex items-center gap-2 uppercase tracking-widest text-muted-foreground">
              <PieChartIcon className="h-4 w-4 text-primary" />
              Burn Distribution
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="h-[250px] w-full">
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
                    innerRadius={65}
                    outerRadius={85}
                    paddingAngle={8}
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
            <div className="space-y-3 mt-6">
              <div className="flex items-center justify-between p-2 rounded-lg hover:bg-muted/30 transition-colors">
                <div className="flex items-center gap-3">
                  <div className="w-3 h-3 rounded-full bg-[#0ea5e9]" />
                  <span className="text-xs font-medium">Inventory Cost</span>
                </div>
                <span className="text-xs font-bold">{totalRevenue > 0 ? ((totalCogs / totalRevenue) * 100).toFixed(0) : 0}%</span>
              </div>
              <div className="flex items-center justify-between p-2 rounded-lg hover:bg-muted/30 transition-colors">
                <div className="flex items-center gap-3">
                  <div className="w-3 h-3 rounded-full bg-[#f59e0b]" />
                  <span className="text-xs font-medium">Operating Exp.</span>
                </div>
                <span className="text-xs font-bold">{totalRevenue > 0 ? ((totalExpenses / totalRevenue) * 100).toFixed(0) : 0}%</span>
              </div>
              <div className="flex items-center justify-between p-2 rounded-lg bg-emerald-500/5 transition-colors">
                <div className="flex items-center gap-3">
                  <div className="w-3 h-3 rounded-full bg-[#10b981]" />
                  <span className="text-xs font-bold text-emerald-600 uppercase tracking-tighter">Net Profit</span>
                </div>
                <span className="text-xs font-black text-emerald-600">{totalRevenue > 0 ? ((netProfit / totalRevenue) * 100).toFixed(0) : 0}%</span>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      <Card className="border-accent/5 overflow-hidden">
        <CardHeader className="bg-muted/10 border-b border-accent/5">
          <CardTitle className="text-lg font-serif">Financial Health Over Time</CardTitle>
          <CardDescription>Correlation between profitability and operating expenses</CardDescription>
        </CardHeader>
        <CardContent className="pt-6">
          <div className="h-80">
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
                  tick={{fill: '#94a3b8', fontSize: 12}} 
                />
                <YAxis 
                  axisLine={false} 
                  tickLine={false} 
                  tick={{fill: '#94a3b8', fontSize: 12}}
                  tickFormatter={(val) => `₦${val/1000}k`}
                />
                <ChartTooltip content={<ChartTooltipContent />} />
                <Area 
                  type="monotone" 
                  dataKey="profit" 
                  stroke="#10b981" 
                  strokeWidth={3}
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
        </CardContent>
      </Card>
    </div>
  );
}

