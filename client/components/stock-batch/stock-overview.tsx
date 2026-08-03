"use client";

import { useState } from "react";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { useQuery } from "@tanstack/react-query";
import { getStockOverviewData } from "@/lib/db/queries/inventory";
import { useStockBatchStats } from "@/lib/hooks/use-stock-batch-stats";
import { useStore } from "@/lib/context/store-context";
import { NeedsAttention } from "./needs-attention";
import { FastMovers } from "./fast-movers";
import { BarcodePrintDialog } from "./barcode-print-dialog";
import { queryKeys } from "@/lib/query-keys";
import type { POSProduct } from "@/lib/types/product";

interface StockItem {
  id: string;
  product_id: string;
  product_name: string;
  batch_number?: string;
  quantity: number;
  reorder_level?: number;
  unit_price: number;
  unit_cost: number;
  expiry_date?: string;
  status: "healthy" | "low" | "critical" | "overstock";
  barcode?: string;
}

export function StockOverview() {
  const { storeProfile: _storeProfile } = useStore();

  // Shared stats hook — single source of truth for all stat cards
  const stats = useStockBatchStats();

  // Stock list — read aggregated batch details
  const { data: stockDataRaw, isLoading: stockLoading } = useQuery({
    ...queryKeys.stockBatches.overview(),
    queryFn: () => getStockOverviewData()
  });
  const stockData = stockDataRaw || [];

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
    product_id: item.id,
    unit_price: item.selling_price || 0,
    unit_cost: item.cost_price || 0,
    status: getStatus(item.quantity, item.reorder_level || 10),
  }));

  const loading = stockLoading || stats.loading;
  const [selectedProduct, setSelectedProduct] = useState<POSProduct | null>(null);

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
    <div className="flex flex-col flex-1 min-h-0 gap-6">
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 flex-1 min-h-0">
        <NeedsAttention stockData={stockItems} />
        <FastMovers />
      </div>

      <BarcodePrintDialog
        isOpen={!!selectedProduct}
        onClose={() => setSelectedProduct(null)}
        product={selectedProduct}
      />
    </div>
  );
}
