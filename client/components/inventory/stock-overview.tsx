"use client";

import { useState } from "react";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { useLocalData } from "@/lib/db/hooks/useLocalData";
import { useInventoryStats } from "@/lib/hooks/use-inventory-stats";
import { useStore } from "@/lib/context/store-context";
import { InventoryMetrics } from "./inventory-metrics";
import { StockStatusList } from "./stock-status-list";
import { InventoryQuickActions } from "./inventory-quick-actions";
import { BarcodePrintDialog } from "./barcode-print-dialog";

interface StockItem {
  id: string;
  medicine_id: string;
  medicine_name: string;
  batch_number: string;
  quantity: number;
  reorder_level: number;
  unit_price: number;
  unit_cost: number;
  expiry_date: string;
  status: "healthy" | "low" | "critical" | "overstock";
}

export function StockOverview() {
  const { storeProfile: _storeProfile } = useStore();

  // Shared stats hook — single source of truth for all stat cards
  const stats = useInventoryStats();

  // Stock list — read from medicines directly (medicines is the stock ledger)
  const { data: stockData, loading: stockLoading } = useLocalData<any>(
    `SELECT 
      id, name as medicine_name, brand_name, batch_number, expiry_date,
      stock_quantity as quantity, reorder_level, cost_price, selling_price
     FROM medicines
     WHERE _deleted = 0
     ORDER BY stock_quantity ASC
     LIMIT 50`,
  );

  const getStatus = (
    quantity: number,
    reorderLevel: number,
  ): StockItem["status"] => {
    if (quantity === 0) return "critical";
    if (quantity <= reorderLevel * 0.5) return "critical";
    if (quantity <= reorderLevel) return "low";
    if (quantity > reorderLevel * 3) return "overstock";
    return "healthy";
  };

  const stockItems: StockItem[] = stockData.map((item) => ({
    ...item,
    medicine_id: item.id,
    unit_price: item.selling_price || 0,
    unit_cost: item.cost_price || 0,
    status: getStatus(item.quantity, item.reorder_level || 10),
  }));

  const loading = stockLoading || stats.loading;
  const [selectedMedicine, setSelectedMedicine] = useState<any>(null);

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
        inventoryValue={stats.totalInventoryValue}
        criticalItems={stats.criticalStockCount}
        lowStockCount={stats.lowStockCount}
        expiringCount={stats.expiringSoonCount}
        formatCurrency={formatCurrency}
      />

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <StockStatusList
          stockData={stockItems}
          formatCurrency={formatCurrency}
          getStatusBadge={getStatusBadge}
          onPrintBarcode={(item) =>
            setSelectedMedicine({
              id: item.id,
              name: item.medicine_name,
              unit_price: item.unit_price,
            })
          }
        />

        <InventoryQuickActions
          criticalItems={stats.criticalStockCount}
          lowStockCount={stats.lowStockCount}
        />
      </div>

      <BarcodePrintDialog
        isOpen={!!selectedMedicine}
        onClose={() => setSelectedMedicine(null)}
        medicine={selectedMedicine}
      />
    </div>
  );
}
