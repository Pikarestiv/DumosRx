"use client";

import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import {
  ChartContainer,
  ChartTooltip,
  ChartTooltipContent,
} from "@/components/ui/chart";
import {
  BarChart,
  Bar,
  PieChart,
  Pie,
  Cell,
  XAxis,
  YAxis,
  CartesianGrid,
  ResponsiveContainer,
  Area,
  AreaChart,
} from "recharts";
import {
  TrendingUp,
  TrendingDown,
  AlertTriangle,
  Calendar,
  DollarSign,
  ArrowUpRight,
  ArrowDownRight,
  PieChart as PieChartIcon,
  Calculator
} from "lucide-react";
import { useLocalData } from "@/lib/db/hooks/useLocalData";
import { useBIData } from "@/lib/hooks/use-bi-data";
import { BIKeyMetrics } from "./bi-key-metrics";
import { formatCurrency } from "@/lib/utils";
import { useStore } from "@/lib/context/store-context";

// Sample data for analytics
const inventoryAlerts = [
  {
    medicine: "Paracetamol 500mg",
    issue: "Low Stock",
    quantity: 45,
    threshold: 100,
    severity: "high",
  },
  {
    medicine: "Insulin Glargine",
    issue: "Expiring Soon",
    expiryDate: "2024-02-15",
    severity: "critical",
  },
  {
    medicine: "Amoxicillin 250mg",
    issue: "Low Stock",
    quantity: 78,
    threshold: 150,
    severity: "medium",
  },
  {
    medicine: "Vitamin D3",
    issue: "Expiring Soon",
    expiryDate: "2024-02-28",
    severity: "high",
  },
];

const customerMetrics = [
  { metric: "Total Customers", value: "2,847", change: "+12.5%", trend: "up" },
  { metric: "Loyalty Members", value: "1,923", change: "+8.3%", trend: "up" },
  {
    metric: "Avg. Transaction",
    value: "₦15,420",
    change: "+5.2%",
    trend: "up",
  },
  {
    metric: "Customer Retention",
    value: "78.5%",
    change: "-2.1%",
    trend: "down",
  },
];

export function BusinessIntelligenceDashboard() {
  const {
    timeRange,
    setTimeRange,
    totalRevenue,
    totalCogs,
    totalExpenses,
    grossProfit,
    netProfit,
    totalTransactions,
    inventoryValue,
    activeCustomers,
    monthlySalesData,
    topSellingMedicines,
    formattedCategoryData,
  } = useBIData();

  const { data: auditLogs } = useLocalData<any>(
    "SELECT al.*, u.name as user_name FROM audit_logs al LEFT JOIN users u ON al.user_id = u.id ORDER BY al.created_at DESC LIMIT 20"
  );

  const { data: returnsData } = useLocalData<any>(
    "SELECT r.*, s.transaction_number, u.name as user_name FROM returns r JOIN sales s ON r.sale_id = s.id JOIN users u ON r.user_id = u.id ORDER BY r.created_at DESC"
  );

  return (
    <div className="space-y-6">
      {/* Header Controls */}
      <div className="flex justify-between items-center">
        <div className="flex items-center gap-4">
          <Select value={timeRange} onValueChange={setTimeRange}>
            <SelectTrigger className="w-40">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="1month">Last Month</SelectItem>
              <SelectItem value="3months">Last 3 Months</SelectItem>
              <SelectItem value="6months">Last 6 Months</SelectItem>
              <SelectItem value="1year">Last Year</SelectItem>
            </SelectContent>
          </Select>
          <Badge variant="outline" className="text-xs bg-green-50 text-green-700 border-green-200">
            Live Data Active
          </Badge>
          <span className="text-xs text-muted-foreground">
            Last updated: {new Date().toLocaleTimeString()}
          </span>
          <Button variant="outline" size="sm">
            <Calendar className="h-4 w-4 mr-2" />
            Custom Range
          </Button>
        </div>
        <Button variant="outline">Export Report</Button>
      </div>

      {/* Live Data Active Notice (Optional replacement for demo notice) */}
      
      <BIKeyMetrics
        totalRevenue={totalRevenue}
        totalTransactions={totalTransactions}
        inventoryValue={inventoryValue}
        activeCustomers={activeCustomers}
        netProfit={netProfit}
      />

      {/* Main Analytics Tabs */}
      <Tabs defaultValue="sales" className="space-y-6">
        <TabsList className="grid w-full grid-cols-6">
          <TabsTrigger value="sales">Sales Analytics</TabsTrigger>
          <TabsTrigger value="profit-loss">Profit & Loss</TabsTrigger>
          <TabsTrigger value="inventory">Inventory Insights</TabsTrigger>
          <TabsTrigger value="customers">Customer Analytics</TabsTrigger>
          <TabsTrigger value="returns">Returns</TabsTrigger>
          <TabsTrigger value="audit">Audit Trail</TabsTrigger>
        </TabsList>

        <TabsContent value="sales" className="space-y-6">
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            {/* Revenue Trend */}
            <Card>
              <CardHeader>
                <CardTitle>Revenue Trend</CardTitle>
                <CardDescription>
                  Monthly revenue and profit analysis
                </CardDescription>
              </CardHeader>
              <CardContent>
                <ChartContainer
                  config={{
                    revenue: { label: "Revenue", color: "#0ea5e9" },
                    profit: { label: "Profit", color: "#10b981" },
                  }}
                  className="h-80"
                >
                  <ResponsiveContainer width="100%" height="100%">
                    <AreaChart data={monthlySalesData}>
                      <CartesianGrid strokeDasharray="3 3" />
                      <XAxis dataKey="month" />
                      <YAxis
                        tickFormatter={(value) =>
                          `₦${(value / 1000).toFixed(0)}k`
                        }
                      />
                      <ChartTooltip content={<ChartTooltipContent />} />
                      <Area
                        type="monotone"
                        dataKey="revenue"
                        stackId="1"
                        stroke="#0ea5e9"
                        fill="#0ea5e9"
                        fillOpacity={0.6}
                      />
                      <Area
                        type="monotone"
                        dataKey="profit"
                        stackId="2"
                        stroke="#10b981"
                        fill="#10b981"
                        fillOpacity={0.6}
                      />
                    </AreaChart>
                  </ResponsiveContainer>
                </ChartContainer>
              </CardContent>
            </Card>

            {/* Top Selling Medicines */}
            <Card>
              <CardHeader>
                <CardTitle>Top Selling Medicines</CardTitle>
                <CardDescription>
                  Best performing products by revenue
                </CardDescription>
              </CardHeader>
              <CardContent>
                <div className="space-y-4">
                  {topSellingMedicines.length === 0 ? (
                    <div className="text-center py-8 text-muted-foreground">
                      No sales data available for this period.
                    </div>
                  ) : (
                    topSellingMedicines.map((medicine, index) => (
                      <div
                        key={medicine.name}
                        className="flex items-center justify-between"
                      >
                        <div className="flex items-center gap-3">
                          <div className="w-8 h-8 rounded-full bg-blue-100 flex items-center justify-center text-sm font-medium text-blue-600">
                            {index + 1}
                          </div>
                          <div>
                            <p className="font-medium">{medicine.name}</p>
                            <p className="text-sm text-gray-500">
                              {medicine.category}
                            </p>
                          </div>
                        </div>
                        <div className="text-right">
                          <p className="font-medium">
                            ₦{medicine.sales.toLocaleString()}
                          </p>
                          <p className="text-sm text-gray-500">
                            {medicine.units} units
                          </p>
                        </div>
                      </div>
                    ))
                  )}
                </div>
              </CardContent>
            </Card>
          </div>

          {/* Sales by Category */}
          <Card>
            <CardHeader>
              <CardTitle>Sales by Category</CardTitle>
              <CardDescription>
                Revenue distribution across medicine categories
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="flex items-center justify-center">
                <ChartContainer
                  config={{
                    value: { label: "Percentage" },
                  }}
                  className="h-80 w-80"
                >
                  <ResponsiveContainer width="100%" height="100%">
                    <PieChart>
                      <Pie
                        data={formattedCategoryData}
                        cx="50%"
                        cy="50%"
                        outerRadius={100}
                        dataKey="value"
                        label={({ name, value }) => `${name}: ${value}`}
                      >
                        {formattedCategoryData.map((entry, index) => (
                          <Cell key={`cell-${index}`} fill={entry.color} />
                        ))}
                      </Pie>
                      <ChartTooltip content={<ChartTooltipContent />} />
                    </PieChart>
                  </ResponsiveContainer>
                </ChartContainer>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="profit-loss" className="space-y-6">
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
                <div className="h-[250px] w-full flex items-center justify-center">
                  <ResponsiveContainer width="100%" height="100%">
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
                      <ChartTooltip />
                    </PieChart>
                  </ResponsiveContainer>
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
                <ResponsiveContainer width="100%" height="100%">
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
                </ResponsiveContainer>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="inventory" className="space-y-6">
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            {/* Inventory Alerts */}
            <Card>
              <CardHeader>
                <CardTitle>Inventory Alerts</CardTitle>
                <CardDescription>
                  Critical stock and expiry notifications
                </CardDescription>
              </CardHeader>
              <CardContent>
                <div className="space-y-4">
                  {inventoryAlerts.map((alert, index) => (
                    <div
                      key={index}
                      className="flex items-center justify-between p-3 border rounded-lg"
                    >
                      <div className="flex items-center gap-3">
                        <AlertTriangle
                          className={`h-5 w-5 ${
                            alert.severity === "critical"
                              ? "text-red-500"
                              : alert.severity === "high"
                                ? "text-orange-500"
                                : "text-yellow-500"
                          }`}
                        />
                        <div>
                          <p className="font-medium">{alert.medicine}</p>
                          <p className="text-sm text-gray-500">{alert.issue}</p>
                        </div>
                      </div>
                      <Badge
                        variant={
                          alert.severity === "critical"
                            ? "destructive"
                            : alert.severity === "high"
                              ? "default"
                              : "secondary"
                        }
                      >
                        {alert.severity}
                      </Badge>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>

            {/* Stock Movement Trends */}
            <Card>
              <CardHeader>
                <CardTitle>Stock Movement Trends</CardTitle>
                <CardDescription>
                  Inventory in/out flow analysis
                </CardDescription>
              </CardHeader>
              <CardContent>
                <ChartContainer
                  config={{
                    inbound: { label: "Stock In", color: "#10b981" },
                    outbound: { label: "Stock Out", color: "#ef4444" },
                  }}
                  className="h-80"
                >
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={monthlySalesData}>
                      <CartesianGrid strokeDasharray="3 3" />
                      <XAxis dataKey="month" />
                      <YAxis />
                      <ChartTooltip content={<ChartTooltipContent />} />
                      <Bar
                        dataKey="transactions"
                        fill="#10b981"
                        name="Stock In"
                      />
                      <Bar dataKey="profit" fill="#ef4444" name="Stock Out" />
                    </BarChart>
                  </ResponsiveContainer>
                </ChartContainer>
              </CardContent>
            </Card>
          </div>
        </TabsContent>

        <TabsContent value="customers" className="space-y-6">
          {/* Customer Metrics */}
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
            {customerMetrics.map((metric) => (
              <Card key={metric.metric}>
                <CardHeader className="pb-2">
                  <CardTitle className="text-sm font-medium">
                    {metric.metric}
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="text-2xl font-bold">{metric.value}</div>
                  <div
                    className={`flex items-center text-xs ${metric.trend === "up" ? "text-green-600" : "text-red-600"}`}
                  >
                    {metric.trend === "up" ? (
                      <TrendingUp className="h-3 w-3 mr-1" />
                    ) : (
                      <TrendingDown className="h-3 w-3 mr-1" />
                    )}
                    {metric.change} from last period
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        </TabsContent>

        <TabsContent value="prescriptions" className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle>Prescription Analytics</CardTitle>
              <CardDescription>
                Prescription processing and fulfillment metrics
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                <div className="text-center">
                  <div className="text-3xl font-bold text-blue-600">1,247</div>
                  <p className="text-sm text-gray-500">Total Prescriptions</p>
                </div>
                <div className="text-center">
                  <div className="text-3xl font-bold text-green-600">94.2%</div>
                  <p className="text-sm text-gray-500">Fulfillment Rate</p>
                </div>
                <div className="text-center">
                  <div className="text-3xl font-bold text-orange-600">
                    2.3 hrs
                  </div>
                  <p className="text-sm text-gray-500">Avg. Processing Time</p>
                </div>
              </div>
            </CardContent>
          </Card>
        </TabsContent>


        <TabsContent value="returns" className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle>Sales Returns History</CardTitle>
              <CardDescription>Track all product returns and refunds</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="border rounded-lg overflow-hidden">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Date</TableHead>
                      <TableHead>Transaction #</TableHead>
                      <TableHead>User</TableHead>
                      <TableHead>Reason</TableHead>
                      <TableHead className="text-right">Amount Refunded</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {returnsData.length === 0 ? (
                      <TableRow>
                        <TableCell colSpan={5} className="text-center py-8 text-muted-foreground">
                          No returns found.
                        </TableCell>
                      </TableRow>
                    ) : (
                      returnsData.map((r: any) => (
                        <TableRow key={r.id}>
                          <TableCell>{new Date(r.created_at).toLocaleDateString()}</TableCell>
                          <TableCell className="font-mono">{r.transaction_number}</TableCell>
                          <TableCell>{r.user_name}</TableCell>
                          <TableCell>{r.reason}</TableCell>
                          <TableCell className="text-right font-bold">
                            ₦{r.total_refunded.toLocaleString()}
                          </TableCell>
                        </TableRow>
                      ))
                    )}
                  </TableBody>
                </Table>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="audit" className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle>System Audit Trail</CardTitle>
              <CardDescription>Security log of all data modifications</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="border rounded-lg overflow-hidden">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Timestamp</TableHead>
                      <TableHead>Action</TableHead>
                      <TableHead>User</TableHead>
                      <TableHead>Module</TableHead>
                      <TableHead>Details</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {auditLogs.length === 0 ? (
                      <TableRow>
                        <TableCell colSpan={5} className="text-center py-8 text-muted-foreground">
                          No logs found.
                        </TableCell>
                      </TableRow>
                    ) : (
                      auditLogs.map((log: any) => (
                        <TableRow key={log.id}>
                          <TableCell className="text-xs">
                            {new Date(log.created_at).toLocaleString()}
                          </TableCell>
                          <TableCell>
                            <Badge variant="outline">{log.action}</Badge>
                          </TableCell>
                          <TableCell>{log.user_name || 'System'}</TableCell>
                          <TableCell className="font-medium">{log.table_name}</TableCell>
                          <TableCell className="text-xs max-w-[200px] truncate">
                            {log.details || '-'}
                          </TableCell>
                        </TableRow>
                      ))
                    )}
                  </TableBody>
                </Table>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="alerts" className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle>System Alerts & Reports</CardTitle>
              <CardDescription>
                Critical notifications and compliance reports
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="space-y-4">
                <div className="p-4 border-l-4 border-red-500 bg-red-50">
                  <h4 className="font-medium text-red-800">
                    Critical Stock Alert
                  </h4>
                  <p className="text-sm text-red-600">
                    12 medicines below minimum stock levels
                  </p>
                </div>
                <div className="p-4 border-l-4 border-orange-500 bg-orange-50">
                  <h4 className="font-medium text-orange-800">
                    Expiry Warning
                  </h4>
                  <p className="text-sm text-orange-600">
                    8 medicines expiring within 30 days
                  </p>
                </div>
                <div className="p-4 border-l-4 border-green-500 bg-green-50">
                  <h4 className="font-medium text-green-800">
                    Compliance Status
                  </h4>
                  <p className="text-sm text-green-600">
                    All NAFDAC requirements up to date
                  </p>
                </div>
              </div>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}
