"use client";

import { useEffect, useState } from "react";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Package,
  TrendingDown,
  AlertTriangle,
  DollarSign,
  ShoppingCart,
  Calendar,
  BarChart3,
  PackageX,
} from "lucide-react";
import { apiClient } from "@/lib/api/client";

interface StockItem {
  id: string;
  medicine_id: string;
  medicine_name: string;
  batch_number: string;
  quantity: number;
  reorder_level: number;
  unit_cost: number;
  unit_price: number;
  expiry_date: string;
  status: "healthy" | "low" | "critical" | "overstock";
}

export function StockOverview() {
  const [loading, setLoading] = useState(true);
  const [stockData, setStockData] = useState<StockItem[]>([]);
  const [inventoryValue, setInventoryValue] = useState(0);
  const [lowStockCount, setLowStockCount] = useState(0);
  const [expiringCount, setExpiringCount] = useState(0);

  useEffect(() => {
    async function fetchData() {
      setLoading(true);
      try {
        const [inventoryRes, lowStockRes, expiringRes, valueRes] =
          await Promise.all([
            apiClient.getInventory(1, 20),
            apiClient.getLowStockItems(),
            apiClient.getExpiringItems(90),
            apiClient.getInventoryValue(),
          ]);

        // Map API response to component interface
        const items = (inventoryRes.data || []).map((item: any) => ({
          ...item,
          medicine_name: item.medicine?.name || item.medicine_name || "Unknown",
          status: getStatus(item.quantity, item.reorder_level),
        }));

        setStockData(items);
        setLowStockCount(lowStockRes.count || lowStockRes.data?.length || 0);
        setExpiringCount(expiringRes.count || expiringRes.data?.length || 0);
        setInventoryValue(valueRes.total_value || valueRes.value || 0);
      } catch (error) {
        console.error("Failed to fetch inventory data:", error);
      } finally {
        setLoading(false);
      }
    }
    fetchData();
  }, []);

  function getStatus(
    quantity: number,
    reorderLevel: number,
  ): StockItem["status"] {
    if (quantity === 0) return "critical";
    if (quantity <= reorderLevel * 0.5) return "critical";
    if (quantity <= reorderLevel) return "low";
    if (quantity > reorderLevel * 3) return "overstock";
    return "healthy";
  }

  const criticalItems = stockData.filter(
    (item) => item.status === "critical",
  ).length;
  const overstockItems = stockData.filter(
    (item) => item.status === "overstock",
  ).length;

  const formatCurrency = (amount: number) => {
    return new Intl.NumberFormat("en-NG", {
      style: "currency",
      currency: "NGN",
      minimumFractionDigits: 0,
    }).format(amount);
  };

  const getStatusBadge = (status: StockItem["status"]) => {
    const variants = {
      healthy: "default",
      low: "outline",
      critical: "destructive",
      overstock: "secondary",
    } as const;

    const labels = {
      healthy: "Healthy",
      low: "Low Stock",
      critical: "Critical",
      overstock: "Overstock",
    };

    return (
      <Badge variant={variants[status]} className="text-xs">
        {labels[status]}
      </Badge>
    );
  };

  if (loading) {
    return (
      <div className="space-y-6">
        {/* Skeleton for Key Metrics */}
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
          {[...Array(4)].map((_, i) => (
            <Card key={i}>
              <CardContent className="p-4">
                <div className="flex items-center justify-between">
                  <div className="space-y-2">
                    <Skeleton className="h-4 w-24" />
                    <Skeleton className="h-8 w-20" />
                  </div>
                  <Skeleton className="h-8 w-8 rounded-full" />
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
        {/* Skeleton for Content */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          <Card>
            <CardHeader>
              <Skeleton className="h-6 w-48" />
              <Skeleton className="h-4 w-64" />
            </CardHeader>
            <CardContent className="space-y-4">
              {[...Array(4)].map((_, i) => (
                <div key={i} className="space-y-2">
                  <Skeleton className="h-4 w-full" />
                  <Skeleton className="h-2 w-full" />
                </div>
              ))}
            </CardContent>
          </Card>
          <Card>
            <CardHeader>
              <Skeleton className="h-6 w-32" />
              <Skeleton className="h-4 w-48" />
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-2 gap-3">
                {[...Array(4)].map((_, i) => (
                  <Skeleton key={i} className="h-20 w-full" />
                ))}
              </div>
            </CardContent>
          </Card>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Key Metrics */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-muted-foreground">
                  Total Inventory Value
                </p>
                <p className="text-2xl font-bold">
                  {formatCurrency(inventoryValue)}
                </p>
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
                <p className="text-sm text-muted-foreground">
                  Critical Stock Items
                </p>
                <p className="text-2xl font-bold text-destructive">
                  {criticalItems}
                </p>
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
                <p className="text-2xl font-bold text-orange-600 dark:text-orange-400">
                  {lowStockCount}
                </p>
              </div>
              <div className="h-8 w-8 bg-orange-100 dark:bg-orange-950/30 rounded-full flex items-center justify-center">
                <TrendingDown className="h-4 w-4 text-orange-600 dark:text-orange-400" />
              </div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="p-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-muted-foreground">
                  Expiring Soon (90d)
                </p>
                <p className="text-2xl font-bold text-blue-600 dark:text-blue-400">
                  {expiringCount}
                </p>
              </div>
              <div className="h-8 w-8 bg-blue-100 dark:bg-blue-950/30 rounded-full flex items-center justify-center">
                <Calendar className="h-4 w-4 text-blue-600 dark:text-blue-400" />
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Stock Status Overview */}
        <Card>
          <CardHeader>
            <CardTitle className="font-serif font-semibold">
              Stock Status Overview
            </CardTitle>
            <CardDescription>
              Current inventory levels and alerts
            </CardDescription>
          </CardHeader>
          <CardContent>
            {stockData.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-12 text-muted-foreground">
                <PackageX className="h-12 w-12 mb-4" />
                <p className="font-medium">No inventory items</p>
                <p className="text-sm">Add medicines to track stock levels.</p>
              </div>
            ) : (
              <div className="space-y-4">
                {stockData.slice(0, 5).map((item) => (
                  <div key={item.id} className="space-y-2">
                    <div className="flex items-center justify-between">
                      <div className="flex-1">
                        <div className="flex items-center gap-2">
                          <h4 className="font-medium text-sm">
                            {item.medicine_name}
                          </h4>
                          {getStatusBadge(item.status)}
                        </div>
                        <p className="text-xs text-muted-foreground">
                          {item.quantity} units •{" "}
                          {formatCurrency(item.quantity * item.unit_price)}
                        </p>
                      </div>
                    </div>
                    <div className="space-y-1">
                      <Progress
                        value={Math.min(
                          (item.quantity / (item.reorder_level * 3)) * 100,
                          100,
                        )}
                        className="h-2"
                      />
                      <div className="flex justify-between text-xs text-muted-foreground">
                        <span>Reorder: {item.reorder_level}</span>
                        <span>Batch: {item.batch_number}</span>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>

        {/* Quick Actions */}
        <Card>
          <CardHeader>
            <CardTitle className="font-serif font-semibold">
              Quick Actions
            </CardTitle>
            <CardDescription>Common inventory management tasks</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-2 gap-3">
              <Button
                variant="outline"
                className="h-20 flex flex-col gap-2 bg-transparent"
              >
                <ShoppingCart className="h-6 w-6" />
                <span className="text-sm">Create Purchase Order</span>
              </Button>
              <Button
                variant="outline"
                className="h-20 flex flex-col gap-2 bg-transparent"
              >
                <Package className="h-6 w-6" />
                <span className="text-sm">Stock Adjustment</span>
              </Button>
              <Button
                variant="outline"
                className="h-20 flex flex-col gap-2 bg-transparent"
              >
                <Calendar className="h-6 w-6" />
                <span className="text-sm">Expiry Report</span>
              </Button>
              <Button
                variant="outline"
                className="h-20 flex flex-col gap-2 bg-transparent"
              >
                <BarChart3 className="h-6 w-6" />
                <span className="text-sm">Inventory Report</span>
              </Button>
            </div>

            <div className="mt-6 space-y-3">
              {criticalItems > 0 && (
                <div className="p-3 bg-destructive/10 border border-destructive/20 rounded-lg">
                  <div className="flex items-center gap-2">
                    <AlertTriangle className="h-4 w-4 text-destructive" />
                    <span className="text-sm font-medium text-destructive">
                      Urgent Reorders Required
                    </span>
                  </div>
                  <p className="text-xs text-destructive/80 mt-1">
                    {criticalItems} items are critically low and need immediate
                    restocking
                  </p>
                </div>
              )}

              {lowStockCount > 0 && (
                <div className="p-3 bg-orange-50 dark:bg-orange-950/30 border border-orange-200 dark:border-orange-900 rounded-lg">
                  <div className="flex items-center gap-2">
                    <TrendingDown className="h-4 w-4 text-orange-600 dark:text-orange-400" />
                    <span className="text-sm font-medium text-orange-800 dark:text-orange-300">
                      Low Stock Warning
                    </span>
                  </div>
                  <p className="text-xs text-orange-600 dark:text-orange-400 mt-1">
                    {lowStockCount} items are approaching reorder levels
                  </p>
                </div>
              )}
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
