"use client";

import { Card, CardContent, CardHeader } from "@/components/ui/card";

import { Skeleton } from "@/components/ui/skeleton";
import { Package, ShoppingCart, TrendingUp, TrendingDown, Receipt } from "lucide-react";
import {
  useDashboardOverview,
  type SalesComparison,
} from "@/lib/hooks/use-dashboard-overview";
import { DashboardStats } from "./dashboard-stats";
import { DashboardRecentActivity } from "./dashboard-recent-activity";
import { DashboardQuickActions } from "./dashboard-quick-actions";
import { DashboardActionCenter } from "./dashboard-action-center";
import { TransactionDetailsDialog } from "@/components/pos/transaction-details-dialog";
import { ExpenseDetailsDialog } from "./modals/expense-details-dialog";
import { ProcurementDetailsDialog } from "./modals/procurement-details-dialog";
import { DashboardPrescriptionDetailsDialog } from "./modals/dashboard-prescription-details-dialog";
import { StockMovementDetailsDialog } from "./modals/stock-movement-details-dialog";
import { formatCurrency } from "@/lib/utils";

function renderSalesComparison(comparison: SalesComparison) {
  if (comparison.state === "none") {
    return (
      <span className="text-muted-foreground font-medium">No sales yesterday</span>
    );
  }
  const isUp = comparison.state === "up";
  return (
    <div className={`flex items-center gap-1 flex-wrap ${isUp ? "text-emerald-600" : "text-red-600"}`}>
      {isUp ? <TrendingUp className="w-3.5 h-3.5" /> : <TrendingDown className="w-3.5 h-3.5" />}
      <span>{comparison.percent.toFixed(1)}%</span>
      <span className="text-muted-foreground font-medium">vs yesterday</span>
    </div>
  );
}

export function DashboardOverview() {
  const {
    t,
    storeProfile,
    selectedActivity,
    setSelectedActivity,
    stock_batchStats,
    stats,
    activeCategories,
    salesToday,
    salesComparison,
    activities,
    getActivityColor,
    isLoading,
  } = useDashboardOverview();

  const statsCards = [
    {
      title: "Today's Sales",
      value: formatCurrency(stats.dailySalesRevenue, storeProfile?.currency),
      comparison: renderSalesComparison(salesComparison),
      icon: ShoppingCart,
      colorScheme: "green" as const,
    },
    {
      title: `Total ${t("products")}`,
      value: stats.totalProducts.toLocaleString(),
      comparison: `Across ${activeCategories} categories`,
      icon: Package,
      colorScheme: "blue" as const,
    },
    {
      title: "Inventory Value",
      value: formatCurrency(
        stock_batchStats.totalStockBatchValue,
        storeProfile?.currency,
      ),
      comparison: "Calculated stock value",
      icon: TrendingUp,
      colorScheme: "amber" as const,
    },
    {
      title: "Orders Today",
      value: String(salesToday[0]?.count || 0),
      comparison: "Completed transactions",
      icon: Receipt,
      colorScheme: "default" as const,
    },
  ];

  if (isLoading) {
    return (
      <div className="space-y-6">
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
          {[...Array(4)].map((_, i) => (
            <Card key={i} className="border-border">
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <Skeleton className="h-4 w-24" />
                <Skeleton className="h-4 w-4" />
              </CardHeader>
              <CardContent>
                <Skeleton className="h-8 w-20 mb-2" />
                <Skeleton className="h-3 w-32" />
              </CardContent>
            </Card>
          ))}
        </div>
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          <Skeleton className="h-64 w-full" />
          <Skeleton className="h-64 w-full" />
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <DashboardStats statsCards={statsCards} />

      <DashboardActionCenter
        expiringCount={stats.expiringSoonCount}
        lowStockCount={stats.lowStockCount}
        missingExpiryCount={stats.missingExpiryCount}
      />

      <div className="flex flex-col lg:grid lg:grid-cols-[1.4fr_1fr] gap-y-6 gap-x-5">
        <div className="order-2 lg:order-1 h-full">
          <DashboardRecentActivity
            activities={activities}
            getActivityColor={getActivityColor}
            onActivityClick={(activity) => setSelectedActivity(activity)}
          />
        </div>

        <div className="order-1 lg:order-2 h-full">
          <DashboardQuickActions />
        </div>
      </div>

      <TransactionDetailsDialog
        sale={
          selectedActivity?.type === "sale"
            ? selectedActivity.rawActivity
            : null
        }
        open={selectedActivity?.type === "sale"}
        onOpenChange={(open) => !open && setSelectedActivity(null)}
        currencyCode={storeProfile?.currency}
      />
      <ExpenseDetailsDialog
        expense={
          selectedActivity?.type === "expense"
            ? selectedActivity.rawActivity
            : null
        }
        open={selectedActivity?.type === "expense"}
        onOpenChange={(open) => !open && setSelectedActivity(null)}
        currencyCode={storeProfile?.currency}
      />
      <ProcurementDetailsDialog
        po={
          selectedActivity?.type === "purchase_order"
            ? selectedActivity.rawActivity
            : null
        }
        open={selectedActivity?.type === "purchase_order"}
        onOpenChange={(open) => !open && setSelectedActivity(null)}
        currencyCode={storeProfile?.currency}
      />
      <DashboardPrescriptionDetailsDialog
        prescription={
          selectedActivity?.type === "prescription"
            ? selectedActivity.rawActivity
            : null
        }
        open={selectedActivity?.type === "prescription"}
        onOpenChange={(open) => !open && setSelectedActivity(null)}
        currencyCode={storeProfile?.currency}
      />
      <StockMovementDetailsDialog
        movement={
          selectedActivity?.type === "stock_movement"
            ? selectedActivity.rawActivity
            : null
        }
        open={selectedActivity?.type === "stock_movement"}
        onOpenChange={(open) => !open && setSelectedActivity(null)}
        currencyCode={storeProfile?.currency}
      />
    </div>
  );
}
