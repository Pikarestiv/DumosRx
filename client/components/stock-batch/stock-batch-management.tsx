"use client";
import { Tabs, TabsContent } from "@/components/ui/tabs";
import { StockBatchTabNav } from "./stock-batch-tab-nav";
import { StockOverview } from "./stock-overview";
import { StockMovements } from "./stock-movements";
import { StockAudits } from "./stock-audits";
import { ProductDatabase } from "@/components/products/product-database";
import { Button } from "@/components/ui/button";
import { StockBatchMetrics } from "./stock-batch-metrics";
import { formatCurrency } from "@/lib/utils";
import { useStockBatchManagement } from "@/lib/hooks/use-stock-batch-management";

export function StockBatchManagement({
  currentTab = "overview",
}: {
  currentTab?: string;
}) {
  const {
    isAdmin,
    canManageStockBatch,
    isAuditing,
    setIsAuditing,
    stats,
    handleTabChange,
  } = useStockBatchManagement(currentTab);

  return (
    <div className="flex flex-col flex-1 min-h-0 gap-6 relative">
      {isAuditing && <StockAudits onClose={() => setIsAuditing(false)} />}

      <Tabs
        value={currentTab}
        onValueChange={handleTabChange}
        className="flex flex-col flex-1 min-h-0 gap-6"
      >
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
          <StockBatchTabNav canManageStockBatch={canManageStockBatch} />

          {isAdmin && (
            <Button
              onClick={() => setIsAuditing(true)}
            >
              Start Audit
            </Button>
          )}
        </div>

        <TabsContent value="catalog" className="flex flex-col flex-1 min-h-0 mt-0">
          <ProductDatabase />
        </TabsContent>

        <TabsContent value="overview" className="flex flex-col flex-1 min-h-0 mt-0 gap-6">
          <StockBatchMetrics
            stock_batchValue={stats.totalStockBatchValue}
            totalProducts={stats.totalProducts}
            lowStockCount={stats.lowStockCount}
            expiringCount={stats.expiringSoonCount}
            activeCategories={stats.activeCategories}
            formatCurrency={formatCurrency}
          />
          <StockOverview />
        </TabsContent>

        {canManageStockBatch && (
          <TabsContent value="ledger" className="flex flex-col flex-1 min-h-0 mt-0">
            <StockMovements />
          </TabsContent>
        )}
      </Tabs>
    </div>
  );
}
