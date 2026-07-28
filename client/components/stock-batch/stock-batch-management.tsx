"use client";
import { Tabs, TabsContent } from "@/components/ui/tabs";
import { StockBatchTabNav } from "./stock-batch-tab-nav";
import { StockOverview } from "./stock-overview";
import { StockMovements } from "./stock-movements";
import { StockAudits } from "./stock-audits";
import { ProductDatabase } from "@/components/products/product-database";
import { Button } from "@/components/ui/button";

import { useStore } from "@/lib/context/store-context";
import { useAuth } from "@/lib/context/auth-context";
import { useRouter } from "next/navigation";
import { StockBatchMetrics } from "./stock-batch-metrics";
import { useStockBatchStats } from "@/lib/hooks/use-stock-batch-stats";
import { formatCurrency } from "@/lib/utils";
import { useState, useEffect } from "react";

export function StockBatchManagement({
  currentTab = "overview",
}: {
  currentTab?: string;
}) {
  const { t: _t } = useStore();
  const { isAdmin } = useAuth();
  const router = useRouter();
  const [isAuditing, setIsAuditing] = useState(false);

  const stats = useStockBatchStats();

  useEffect(() => {
    if (currentTab === "audits") {
      setIsAuditing(true);
      router.replace("/inventory/overview");
    }
  }, [currentTab, router]);

  return (
    <div className="flex flex-col flex-1 min-h-0 gap-6 relative">
      {isAuditing && <StockAudits onClose={() => setIsAuditing(false)} />}
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
        className="flex flex-col flex-1 min-h-0 gap-6"
      >
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
          <StockBatchTabNav />

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

        <TabsContent value="overview" className="flex flex-col flex-1 min-h-0 mt-0">
          <StockOverview />
        </TabsContent>

        <TabsContent value="ledger" className="flex flex-col flex-1 min-h-0 mt-0">
          <StockMovements />
        </TabsContent>
      </Tabs>
    </div>
  );
}
