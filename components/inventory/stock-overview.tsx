"use client"

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Progress } from "@/components/ui/progress"
import { Package, TrendingDown, AlertTriangle, DollarSign, ShoppingCart, Calendar, BarChart3 } from "lucide-react"

interface StockItem {
  id: string
  name: string
  currentStock: number
  reorderLevel: number
  maxStock: number
  value: number
  lastRestocked: string
  supplier: string
  status: "healthy" | "low" | "critical" | "overstock"
}

const stockData: StockItem[] = [
  {
    id: "1",
    name: "Paracetamol 500mg",
    currentStock: 500,
    reorderLevel: 100,
    maxStock: 1000,
    value: 25000,
    lastRestocked: "2024-01-15",
    supplier: "Emzor Pharmaceuticals",
    status: "healthy",
  },
  {
    id: "2",
    name: "Amoxicillin 250mg",
    currentStock: 15,
    reorderLevel: 50,
    maxStock: 300,
    value: 2700,
    lastRestocked: "2024-01-10",
    supplier: "May & Baker Nigeria",
    status: "critical",
  },
  {
    id: "3",
    name: "Vitamin C 1000mg",
    currentStock: 850,
    reorderLevel: 200,
    maxStock: 500,
    value: 42500,
    lastRestocked: "2024-01-20",
    supplier: "Chi Pharmaceuticals",
    status: "overstock",
  },
  {
    id: "4",
    name: "Ibuprofen 400mg",
    currentStock: 75,
    reorderLevel: 80,
    maxStock: 400,
    value: 9000,
    lastRestocked: "2024-01-12",
    supplier: "GSK Nigeria",
    status: "low",
  },
]

export function StockOverview() {
  const totalValue = stockData.reduce((sum, item) => sum + item.value, 0)
  const criticalItems = stockData.filter((item) => item.status === "critical").length
  const lowStockItems = stockData.filter((item) => item.status === "low").length
  const overstockItems = stockData.filter((item) => item.status === "overstock").length

  const formatCurrency = (amount: number) => {
    return new Intl.NumberFormat("en-NG", {
      style: "currency",
      currency: "NGN",
      minimumFractionDigits: 0,
    }).format(amount)
  }

  const getStatusColor = (status: StockItem["status"]) => {
    switch (status) {
      case "healthy":
        return "bg-green-500"
      case "low":
        return "bg-yellow-500"
      case "critical":
        return "bg-red-500"
      case "overstock":
        return "bg-blue-500"
      default:
        return "bg-gray-500"
    }
  }

  const getStatusBadge = (status: StockItem["status"]) => {
    const variants = {
      healthy: "default",
      low: "outline",
      critical: "destructive",
      overstock: "secondary",
    } as const

    const labels = {
      healthy: "Healthy",
      low: "Low Stock",
      critical: "Critical",
      overstock: "Overstock",
    }

    return (
      <Badge variant={variants[status]} className="text-xs">
        {labels[status]}
      </Badge>
    )
  }

  return (
    <div className="space-y-6">
      {/* Key Metrics */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-muted-foreground">Total Inventory Value</p>
                <p className="text-2xl font-bold">{formatCurrency(totalValue)}</p>
              </div>
              <div className="h-8 w-8 bg-primary/10 rounded-full flex items-center justify-center">
                <DollarSign className="h-4 w-4 text-primary" />
              </div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="p-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-muted-foreground">Critical Stock Items</p>
                <p className="text-2xl font-bold text-destructive">{criticalItems}</p>
              </div>
              <div className="h-8 w-8 bg-destructive/10 rounded-full flex items-center justify-center">
                <AlertTriangle className="h-4 w-4 text-destructive" />
              </div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="p-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-muted-foreground">Low Stock Items</p>
                <p className="text-2xl font-bold text-orange-600">{lowStockItems}</p>
              </div>
              <div className="h-8 w-8 bg-orange-100 rounded-full flex items-center justify-center">
                <TrendingDown className="h-4 w-4 text-orange-600" />
              </div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="p-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-muted-foreground">Overstock Items</p>
                <p className="text-2xl font-bold text-blue-600">{overstockItems}</p>
              </div>
              <div className="h-8 w-8 bg-blue-100 rounded-full flex items-center justify-center">
                <Package className="h-4 w-4 text-blue-600" />
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Stock Status Overview */}
        <Card>
          <CardHeader>
            <CardTitle className="font-serif font-semibold">Stock Status Overview</CardTitle>
            <CardDescription>Current inventory levels and alerts</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="space-y-4">
              {stockData.map((item) => (
                <div key={item.id} className="space-y-2">
                  <div className="flex items-center justify-between">
                    <div className="flex-1">
                      <div className="flex items-center gap-2">
                        <h4 className="font-medium text-sm">{item.name}</h4>
                        {getStatusBadge(item.status)}
                      </div>
                      <p className="text-xs text-muted-foreground">
                        {item.currentStock} / {item.maxStock} units • {formatCurrency(item.value)}
                      </p>
                    </div>
                  </div>
                  <div className="space-y-1">
                    <Progress
                      value={(item.currentStock / item.maxStock) * 100}
                      className="h-2"
                      style={{
                        background: "var(--muted)",
                      }}
                    />
                    <div className="flex justify-between text-xs text-muted-foreground">
                      <span>Reorder: {item.reorderLevel}</span>
                      <span>Max: {item.maxStock}</span>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>

        {/* Quick Actions */}
        <Card>
          <CardHeader>
            <CardTitle className="font-serif font-semibold">Quick Actions</CardTitle>
            <CardDescription>Common inventory management tasks</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-2 gap-3">
              <Button variant="outline" className="h-20 flex flex-col gap-2 bg-transparent">
                <ShoppingCart className="h-6 w-6" />
                <span className="text-sm">Create Purchase Order</span>
              </Button>
              <Button variant="outline" className="h-20 flex flex-col gap-2 bg-transparent">
                <Package className="h-6 w-6" />
                <span className="text-sm">Stock Adjustment</span>
              </Button>
              <Button variant="outline" className="h-20 flex flex-col gap-2 bg-transparent">
                <Calendar className="h-6 w-6" />
                <span className="text-sm">Expiry Report</span>
              </Button>
              <Button variant="outline" className="h-20 flex flex-col gap-2 bg-transparent">
                <BarChart3 className="h-6 w-6" />
                <span className="text-sm">Inventory Report</span>
              </Button>
            </div>

            <div className="mt-6 space-y-3">
              <div className="p-3 bg-destructive/10 border border-destructive/20 rounded-lg">
                <div className="flex items-center gap-2">
                  <AlertTriangle className="h-4 w-4 text-destructive" />
                  <span className="text-sm font-medium text-destructive">Urgent Reorders Required</span>
                </div>
                <p className="text-xs text-destructive/80 mt-1">
                  {criticalItems} items are critically low and need immediate restocking
                </p>
              </div>

              {lowStockItems > 0 && (
                <div className="p-3 bg-orange-50 border border-orange-200 rounded-lg">
                  <div className="flex items-center gap-2">
                    <TrendingDown className="h-4 w-4 text-orange-600" />
                    <span className="text-sm font-medium text-orange-800">Low Stock Warning</span>
                  </div>
                  <p className="text-xs text-orange-600 mt-1">{lowStockItems} items are approaching reorder levels</p>
                </div>
              )}
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Recent Activity */}
      <Card>
        <CardHeader>
          <CardTitle className="font-serif font-semibold">Recent Inventory Activity</CardTitle>
          <CardDescription>Latest stock movements and transactions</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="space-y-4">
            <div className="flex items-center gap-3 p-3 bg-muted rounded-lg">
              <div className="w-2 h-2 bg-green-500 rounded-full"></div>
              <div className="flex-1">
                <p className="text-sm font-medium">Stock Received</p>
                <p className="text-xs text-muted-foreground">Paracetamol 500mg - 200 units from Emzor</p>
              </div>
              <span className="text-xs text-muted-foreground">2 hours ago</span>
            </div>

            <div className="flex items-center gap-3 p-3 bg-muted rounded-lg">
              <div className="w-2 h-2 bg-red-500 rounded-full"></div>
              <div className="flex-1">
                <p className="text-sm font-medium">Stock Sold</p>
                <p className="text-xs text-muted-foreground">Amoxicillin 250mg - 10 units</p>
              </div>
              <span className="text-xs text-muted-foreground">4 hours ago</span>
            </div>

            <div className="flex items-center gap-3 p-3 bg-muted rounded-lg">
              <div className="w-2 h-2 bg-blue-500 rounded-full"></div>
              <div className="flex-1">
                <p className="text-sm font-medium">Stock Adjustment</p>
                <p className="text-xs text-muted-foreground">Vitamin C 1000mg - Adjusted +50 units (Damaged goods)</p>
              </div>
              <span className="text-xs text-muted-foreground">1 day ago</span>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  )
}
