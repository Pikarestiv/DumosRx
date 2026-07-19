"use client";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { StockOverview } from "./stock-overview";
import { StockMovements } from "./stock-movements";
import { StockAdjustments } from "./stock-adjustments";
import { BatchTracking } from "./batch-tracking";
import { ProductDatabase } from "@/components/products/product-database";

import { useStore } from "@/lib/context/store-context";
import { useAuth } from "@/lib/context/auth-context";
import { useRouter } from "next/navigation";
import { StockBatchMetrics } from "./stock-batch-metrics";
import { useStockBatchStats } from "@/lib/hooks/use-stock-batch-stats";
import { formatCurrency } from "@/lib/utils";

export function StockBatchManagement({
  currentTab = "overview",
}: {
  currentTab?: string;
}) {
  const { t } = useStore();
  const { isAdmin } = useAuth();
  const router = useRouter();
  
  const stats = useStockBatchStats();

  return (
    <div className="space-y-6">
      <StockBatchMetrics
        stock_batchValue={stats.totalStockBatchValue}
        totalProducts={stats.totalProducts}
        lowStockCount={stats.lowStockCount}
        expiringCount={stats.expiringSoonCount}
        activeCategories={stats.activeCategories}
        formatCurrency={formatCurrency}
      />

      <Tabs
        value={currentTab}
        onValueChange={(val) => router.push(`/inventory/${val}`)}
        className="space-y-6"
      >
        <TabsList className="w-full md:w-max">
          <TabsTrigger value="overview">
            Overview
          </TabsTrigger>
          <TabsTrigger value="products" className="capitalize">
            {t("products")} Database
          </TabsTrigger>
          <TabsTrigger value="batches">
            Batches & Expiry
          </TabsTrigger>
          <TabsTrigger value="movements">
            Stock Movements
          </TabsTrigger>
          {isAdmin && (
            <TabsTrigger value="adjustments">
              Adjustments
            </TabsTrigger>
          )}
        </TabsList>

        <TabsContent value="products">
          <ProductDatabase />
        </TabsContent>

        <TabsContent value="overview">
          <StockOverview />
        </TabsContent>

        <TabsContent value="batches">
          <BatchTracking />
        </TabsContent>

        <TabsContent value="movements">
          <StockMovements />
        </TabsContent>

        {isAdmin && (
          <TabsContent value="adjustments">
            <StockAdjustments />
          </TabsContent>
        )}
      </Tabs>
    </div>
  );
}
