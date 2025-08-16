"use client"

import { useState } from "react"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { Button } from "@/components/ui/button"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Badge } from "@/components/ui/badge"
import { ChartContainer, ChartTooltip, ChartTooltipContent } from "@/components/ui/chart"
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
} from "recharts"
import { TrendingUp, TrendingDown, DollarSign, Package, Users, FileText, AlertTriangle, Calendar } from "lucide-react"

// Sample data for analytics
const salesData = [
  { month: "Jan", revenue: 2400000, transactions: 1240, profit: 480000 },
  { month: "Feb", revenue: 2100000, transactions: 1100, profit: 420000 },
  { month: "Mar", revenue: 2800000, transactions: 1450, profit: 560000 },
  { month: "Apr", revenue: 3200000, transactions: 1680, profit: 640000 },
  { month: "May", revenue: 2900000, transactions: 1520, profit: 580000 },
  { month: "Jun", revenue: 3500000, transactions: 1820, profit: 700000 },
]

const topMedicines = [
  { name: "Paracetamol 500mg", sales: 1250000, units: 2500, category: "Analgesics" },
  { name: "Amoxicillin 250mg", sales: 980000, units: 1960, category: "Antibiotics" },
  { name: "Vitamin C 1000mg", sales: 750000, units: 1500, category: "Vitamins" },
  { name: "Ibuprofen 400mg", sales: 680000, units: 1360, category: "Anti-inflammatory" },
  { name: "Omeprazole 20mg", sales: 620000, units: 1240, category: "Gastric" },
]

const categoryData = [
  { name: "Antibiotics", value: 35, color: "#0ea5e9" },
  { name: "Analgesics", value: 25, color: "#10b981" },
  { name: "Vitamins", value: 20, color: "#f59e0b" },
  { name: "Anti-inflammatory", value: 12, color: "#ef4444" },
  { name: "Others", value: 8, color: "#8b5cf6" },
]

const inventoryAlerts = [
  { medicine: "Paracetamol 500mg", issue: "Low Stock", quantity: 45, threshold: 100, severity: "high" },
  { medicine: "Insulin Glargine", issue: "Expiring Soon", expiryDate: "2024-02-15", severity: "critical" },
  { medicine: "Amoxicillin 250mg", issue: "Low Stock", quantity: 78, threshold: 150, severity: "medium" },
  { medicine: "Vitamin D3", issue: "Expiring Soon", expiryDate: "2024-02-28", severity: "high" },
]

const customerMetrics = [
  { metric: "Total Customers", value: "2,847", change: "+12.5%", trend: "up" },
  { metric: "Loyalty Members", value: "1,923", change: "+8.3%", trend: "up" },
  { metric: "Avg. Transaction", value: "₦15,420", change: "+5.2%", trend: "up" },
  { metric: "Customer Retention", value: "78.5%", change: "-2.1%", trend: "down" },
]

export function BusinessIntelligenceDashboard() {
  const [timeRange, setTimeRange] = useState("6months")

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
          <Button variant="outline" size="sm">
            <Calendar className="h-4 w-4 mr-2" />
            Custom Range
          </Button>
        </div>
        <Button>Export Report</Button>
      </div>

      {/* Key Metrics Cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Total Revenue</CardTitle>
            <DollarSign className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">₦16,900,000</div>
            <div className="flex items-center text-xs text-green-600">
              <TrendingUp className="h-3 w-3 mr-1" />
              +12.5% from last period
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Total Transactions</CardTitle>
            <FileText className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">8,810</div>
            <div className="flex items-center text-xs text-green-600">
              <TrendingUp className="h-3 w-3 mr-1" />
              +8.2% from last period
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Inventory Value</CardTitle>
            <Package className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">₦8,450,000</div>
            <div className="flex items-center text-xs text-red-600">
              <TrendingDown className="h-3 w-3 mr-1" />
              -3.1% from last period
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Active Customers</CardTitle>
            <Users className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">2,847</div>
            <div className="flex items-center text-xs text-green-600">
              <TrendingUp className="h-3 w-3 mr-1" />
              +12.5% from last period
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Main Analytics Tabs */}
      <Tabs defaultValue="sales" className="space-y-6">
        <TabsList className="grid w-full grid-cols-5">
          <TabsTrigger value="sales">Sales Analytics</TabsTrigger>
          <TabsTrigger value="inventory">Inventory Insights</TabsTrigger>
          <TabsTrigger value="customers">Customer Analytics</TabsTrigger>
          <TabsTrigger value="prescriptions">Prescriptions</TabsTrigger>
          <TabsTrigger value="alerts">Alerts & Reports</TabsTrigger>
        </TabsList>

        <TabsContent value="sales" className="space-y-6">
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            {/* Revenue Trend */}
            <Card>
              <CardHeader>
                <CardTitle>Revenue Trend</CardTitle>
                <CardDescription>Monthly revenue and profit analysis</CardDescription>
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
                    <AreaChart data={salesData}>
                      <CartesianGrid strokeDasharray="3 3" />
                      <XAxis dataKey="month" />
                      <YAxis tickFormatter={(value) => `₦${(value / 1000000).toFixed(1)}M`} />
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
                <CardDescription>Best performing products by revenue</CardDescription>
              </CardHeader>
              <CardContent>
                <div className="space-y-4">
                  {topMedicines.map((medicine, index) => (
                    <div key={medicine.name} className="flex items-center justify-between">
                      <div className="flex items-center gap-3">
                        <div className="w-8 h-8 rounded-full bg-blue-100 flex items-center justify-center text-sm font-medium text-blue-600">
                          {index + 1}
                        </div>
                        <div>
                          <p className="font-medium">{medicine.name}</p>
                          <p className="text-sm text-gray-500">{medicine.category}</p>
                        </div>
                      </div>
                      <div className="text-right">
                        <p className="font-medium">₦{medicine.sales.toLocaleString()}</p>
                        <p className="text-sm text-gray-500">{medicine.units} units</p>
                      </div>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
          </div>

          {/* Sales by Category */}
          <Card>
            <CardHeader>
              <CardTitle>Sales by Category</CardTitle>
              <CardDescription>Revenue distribution across medicine categories</CardDescription>
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
                        data={categoryData}
                        cx="50%"
                        cy="50%"
                        outerRadius={100}
                        dataKey="value"
                        label={({ name, value }) => `${name}: ${value}%`}
                      >
                        {categoryData.map((entry, index) => (
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

        <TabsContent value="inventory" className="space-y-6">
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            {/* Inventory Alerts */}
            <Card>
              <CardHeader>
                <CardTitle>Inventory Alerts</CardTitle>
                <CardDescription>Critical stock and expiry notifications</CardDescription>
              </CardHeader>
              <CardContent>
                <div className="space-y-4">
                  {inventoryAlerts.map((alert, index) => (
                    <div key={index} className="flex items-center justify-between p-3 border rounded-lg">
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
                <CardDescription>Inventory in/out flow analysis</CardDescription>
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
                    <BarChart data={salesData}>
                      <CartesianGrid strokeDasharray="3 3" />
                      <XAxis dataKey="month" />
                      <YAxis />
                      <ChartTooltip content={<ChartTooltipContent />} />
                      <Bar dataKey="transactions" fill="#10b981" name="Stock In" />
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
                  <CardTitle className="text-sm font-medium">{metric.metric}</CardTitle>
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
              <CardDescription>Prescription processing and fulfillment metrics</CardDescription>
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
                  <div className="text-3xl font-bold text-orange-600">2.3 hrs</div>
                  <p className="text-sm text-gray-500">Avg. Processing Time</p>
                </div>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="alerts" className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle>System Alerts & Reports</CardTitle>
              <CardDescription>Critical notifications and compliance reports</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="space-y-4">
                <div className="p-4 border-l-4 border-red-500 bg-red-50">
                  <h4 className="font-medium text-red-800">Critical Stock Alert</h4>
                  <p className="text-sm text-red-600">12 medicines below minimum stock levels</p>
                </div>
                <div className="p-4 border-l-4 border-orange-500 bg-orange-50">
                  <h4 className="font-medium text-orange-800">Expiry Warning</h4>
                  <p className="text-sm text-orange-600">8 medicines expiring within 30 days</p>
                </div>
                <div className="p-4 border-l-4 border-green-500 bg-green-50">
                  <h4 className="font-medium text-green-800">Compliance Status</h4>
                  <p className="text-sm text-green-600">All NAFDAC requirements up to date</p>
                </div>
              </div>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  )
}
