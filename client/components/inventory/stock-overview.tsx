"use client";

import { useEffect, useState } from "react";
import {
  Card,
  CardContent,
  CardHeader,
} from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { apiClient } from "@/lib/api/client";
import { InventoryMetrics } from "./inventory-metrics";
import { StockStatusList } from "./stock-status-list";
import { InventoryQuickActions } from "./inventory-quick-actions";

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
      <InventoryMetrics 
        inventoryValue={inventoryValue}
        criticalItems={criticalItems}
        lowStockCount={lowStockCount}
        expiringCount={expiringCount}
        formatCurrency={formatCurrency}
      />

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <StockStatusList 
          stockData={stockData}
          formatCurrency={formatCurrency}
          getStatusBadge={getStatusBadge}
        />

        <InventoryQuickActions 
          criticalItems={criticalItems}
          lowStockCount={lowStockCount}
        />
      </div>
    </div>
  );
}
