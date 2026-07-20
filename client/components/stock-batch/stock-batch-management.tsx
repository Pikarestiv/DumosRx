"use client";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { StockOverview } from "./stock-overview";
import { StockMovements } from "./stock-movements";
import { StockAudits } from "./stock-audits";
import { ProductDatabase } from "@/components/products/product-database";

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
  const { t } = useStore();
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
    <div className="space-y-6 relative">
      {isAuditing && <StockAudits onClose={() => setIsAuditing(false)} />}
      <StockBatchMetrics
        stock_batchValue={stats.totalStockBatchValue}
        totalProducts={stats.totalProducts}
        lowStockCount={stats.lowStockCount}
        expiringCount={stats.expiringSoonCount}
        activeCategories={stats.activeCategories}
        formatCurrency={formatCurrency}
      />

      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <Tabs
          value={currentTab}
          onValueChange={(val) => router.push(`/inventory/${val}`)}
          className="space-y-6 w-full"
        >
          <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
            <TabsList className="w-full md:w-max">
              <TabsTrigger value="overview">Overview</TabsTrigger>
              <TabsTrigger value="catalog">Catalog</TabsTrigger>
              <TabsTrigger value="ledger">Ledger</TabsTrigger>
            </TabsList>

            {isAdmin && (
              <button
                onClick={() => setIsAuditing(true)}
                className="bg-[#2054E0] text-white px-4 py-2 rounded-xl text-[14px] font-semibold hover:bg-[#1A43B3] transition-colors"
              >
                Start Audit
              </button>
            )}
          </div>

          <TabsContent value="catalog" className="mt-0 outline-none">
            <ProductDatabase />
          </TabsContent>

          <TabsContent value="overview">
            <StockOverview />
          </TabsContent>

          <TabsContent value="ledger">
            <StockMovements />
          </TabsContent>
        </Tabs>
      </div>
    </div>
  );
}
