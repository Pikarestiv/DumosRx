"use client";

import { useState } from "react";
import { Circle } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardHeader,
  CardTitle,
  CardDescription,
} from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { useRouter, useSearchParams } from "next/navigation";
import { StoreActivitiesTab } from "./fleet/store-activities-tab";
import { StoreTransactionsTab } from "./fleet/store-transactions-tab";
import { StoreStockBatchTab } from "./fleet/store-stock-batch-tab";

export function FleetStoreDetailsView({
  storeId,
  stores,
}: {
  storeId?: string;
  stores?: any[];
}) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [activeTab, setActiveTab] = useState(
    searchParams.get("tab") || "overview",
  );

  const handleTabChange = (tab: string) => {
    setActiveTab(tab);
    router.replace(`/dashboard/store-details/?id=${storeId}&tab=${tab}`);
  };

  if (!storeId || !stores) return null;
  const store = stores.find((s: any) => s.id.toString() === storeId);
  if (!store) {
    return (
      <div className="flex flex-col items-center justify-center py-20">
        <h2 className="text-2xl font-bold mb-2">Store Not Found</h2>
        <Button onClick={() => router.push("/dashboard/fleet")}>
          Back to Fleet
        </Button>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-4">
        <Button
          variant="outline"
          size="sm"
          onClick={() => router.push("/dashboard/fleet")}
        >
          &larr; Back
        </Button>
        <h1 className="text-2xl font-black">{store.name}</h1>
        <Badge
          variant="outline"
          className={`${store.status === "online" ? "bg-green-50 text-green-700 border-green-200" : "bg-slate-50 text-slate-500 border-slate-200"} font-bold`}
        >
          <Circle
            className={`h-2 w-2 mr-2 fill-current ${store.status === "online" ? "text-green-500" : "text-slate-300"}`}
          />
          {store.status}
        </Badge>
      </div>
      <p className="text-muted-foreground">
        {store.location || store.address || "N/A"}
      </p>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-4 py-4">
        <Card className="border-none shadow-sm bg-muted/30">
          <CardHeader className="p-4 pb-2">
            <CardDescription className="font-bold uppercase text-xs">
              Total Revenue
            </CardDescription>
            <CardTitle className="text-2xl font-black">{store.sales}</CardTitle>
          </CardHeader>
        </Card>
        <Card className="border-none shadow-sm bg-muted/30">
          <CardHeader className="p-4 pb-2">
            <CardDescription className="font-bold uppercase text-xs">
              Active Staff
            </CardDescription>
            <CardTitle className="text-2xl font-black">
              {store.staff_count ?? 0}
            </CardTitle>
          </CardHeader>
        </Card>
        <Card className="border-none shadow-sm bg-muted/30">
          <CardHeader className="p-4 pb-2">
            <CardDescription className="font-bold uppercase text-xs">
              Total Stock Batch
            </CardDescription>
            <CardTitle className="text-2xl font-black">
              {store.total_stock_batch ?? 0}
            </CardTitle>
          </CardHeader>
        </Card>
        <Card className="border-none shadow-sm bg-red-50 dark:bg-red-950/20">
          <CardHeader className="p-4 pb-2">
            <CardDescription className="font-bold uppercase text-xs text-red-600">
              Action Needed
            </CardDescription>
            <CardTitle className="text-xl font-black text-red-600">
              {store.low_stock_alerts ?? 0} Low Stock
            </CardTitle>
            {store.expiring_items > 0 && (
              <p className="text-xs text-red-600 font-bold mt-1">
                {store.expiring_items} Expiring Soon
              </p>
            )}
          </CardHeader>
        </Card>
      </div>

      <div className="flex gap-4 border-b mb-4 pb-2">
        <Button
          variant={activeTab === "overview" ? "secondary" : "ghost"}
          size="sm"
          className="rounded-xl font-bold"
          onClick={() => handleTabChange("overview")}
        >
          Overview
        </Button>
        <Button
          variant={activeTab === "activities" ? "secondary" : "ghost"}
          size="sm"
          className="rounded-xl font-bold"
          onClick={() => handleTabChange("activities")}
        >
          Recent Activities
        </Button>
        <Button
          variant={activeTab === "transactions" ? "secondary" : "ghost"}
          size="sm"
          className="rounded-xl font-bold"
          onClick={() => handleTabChange("transactions")}
        >
          Recent Sales
        </Button>
        <Button
          variant={activeTab === "stock_batch" ? "secondary" : "ghost"}
          size="sm"
          className="rounded-xl font-bold"
          onClick={() => handleTabChange("stock_batch")}
        >
          Stock Batch
        </Button>
      </div>

      <div className="space-y-4 min-h-[300px]">
        {activeTab === "overview" && (
          <div className="grid grid-cols-2 gap-y-6 gap-x-4">
            <div>
              <p className="text-xs font-bold uppercase text-slate-500 mb-1">
                Store ID
              </p>
              <p className="font-mono text-sm bg-muted inline-block px-2 py-1 rounded">
                {store.id}
              </p>
            </div>
            <div>
              <p className="text-xs font-bold uppercase text-slate-500 mb-1">
                Contact Phone
              </p>
              <p className="font-medium">{store.phone || "N/A"}</p>
            </div>
            <div>
              <p className="text-xs font-bold uppercase text-slate-500 mb-1">
                Store Type
              </p>
              <p className="font-medium capitalize">
                {store.store_type || "Retail"}
              </p>
            </div>
            <div>
              <p className="text-xs font-bold uppercase text-slate-500 mb-1">
                Last Sync
              </p>
              <p className="font-medium">{store.lastSync}</p>
            </div>
            <div>
              <p className="text-xs font-bold uppercase text-slate-500 mb-1">
                Today's Sales
              </p>
              <p className="font-black text-green-600 text-lg">
                {store.daily_sales}
              </p>
            </div>
          </div>
        )}

        {activeTab === "activities" && (
          <div className="space-y-3">
            <StoreActivitiesTab store={store} storeId={storeId} />
          </div>
        )}

        {activeTab === "transactions" && (
          <div className="space-y-4">
            <StoreTransactionsTab store={store} />
          </div>
        )}

        {activeTab === "stock_batch" && <StoreStockBatchTab store={store} />}
      </div>
    </div>
  );
}
