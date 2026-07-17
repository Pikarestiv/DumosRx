"use client";

import { Card, CardContent, CardHeader } from "@/components/ui/card";

import { Skeleton } from "@/components/ui/skeleton";
import { Package, ShoppingCart, TrendingUp, Receipt } from "lucide-react";
import { useQuery } from "@tanstack/react-query";
import { getDashboardOverviewData } from "@/lib/db/queries/reports";
import { useStockBatchStats } from "@/lib/hooks/use-stock-batch-stats";
import { useStore } from "@/lib/context/store-context";
import { useAuth } from "@/lib/context/auth-context";
import { DashboardStats } from "./dashboard-stats";
import { DashboardRecentActivity } from "./dashboard-recent-activity";
import { DashboardQuickActions } from "./dashboard-quick-actions";
import { DashboardActionCenter } from "./dashboard-action-center";
import { useState } from "react";
import { TransactionDetailsDialog } from "@/components/pos/transaction-details-dialog";
import { formatCurrency } from "@/lib/utils";

export function DashboardOverview() {
  const { t, storeProfile } = useStore();
  const { user } = useAuth();
  const [selectedSale, setSelectedSale] = useState<any>(null);

  // Single source of truth for all stock-batch-related stat cards
  const stock_batchStats = useStockBatchStats();

  const isRestrictedRole =
    user?.role === "sales_staff" || user?.role === "specialist";
  const { data: dashboardData } = useQuery({
    queryKey: ["dashboardOverviewData", user?.id, isRestrictedRole],
    queryFn: () => getDashboardOverviewData(user?.id, isRestrictedRole),
  });

  const salesToday = dashboardData?.salesToday
    ? [dashboardData.salesToday]
    : [];
  const refundsToday = dashboardData?.refundsToday
    ? [dashboardData.refundsToday]
    : [];
  const recentActivities = dashboardData?.recentActivities || [];
  const salesYesterday = dashboardData?.salesYesterday?.total || 0;
  const activeCategories = dashboardData?.activeCategories || 0;

  

  const todayRevenue =
    (salesToday[0]?.total || 0) - (refundsToday[0]?.total || 0);

  let salesComparison = "No sales yesterday";
  if (salesYesterday > 0) {
    const diff = todayRevenue - salesYesterday;
    const perc = (Math.abs(diff) / salesYesterday) * 100;
    salesComparison = `${diff >= 0 ? "▲" : "▼"} ${perc.toFixed(1)}% vs yesterday`;
  } else if (todayRevenue > 0) {
    salesComparison = "▲ 100% vs yesterday";
  }

  const stats = {
    totalProducts: stock_batchStats.activeProducts,
    dailySalesRevenue: todayRevenue,
    expiringSoon: stock_batchStats.expiringSoonCount,
    lowStockCount: stock_batchStats.lowStockCount,
  };

  const activities = recentActivities.slice(0, 5).map((activity: any) => {
    let message = "";
    let amount = "";

    if (activity.activity_type === "sale") {
      message = `${t("product")} sale: ${activity.transaction_number || activity.id.slice(0, 8)}`;
      const val = Number(activity.total_amount !== undefined ? activity.total_amount : activity.total);
      amount = isNaN(val) ? "N/A" : formatCurrency(val, storeProfile?.currency);
    } else if (activity.activity_type === "stock_movement") {
      message = `Stock ${activity.movement_type}: ${Math.abs(activity.quantity)} units`;
      const val = Number(activity.total_cost);
      if (!isNaN(val) && val > 0) {
        amount = formatCurrency(val, storeProfile?.currency);
      }
    } else if (activity.activity_type === "prescription") {
      message = `Prescription logged: ${activity.patient_name || "Patient"}`;
    }

    return {
      id: activity.id,
      type: activity.activity_type,
      message,
      timestamp: activity.created_at,
      amount,
      rawSale: activity.activity_type === "sale" ? activity : undefined,
    };
  });

  const getActivityColor = (type: string) => {
    switch (type) {
      case "sale":
        return "bg-green-500/10 text-green-600";
      case "stock_movement":
        return "bg-blue-500/10 text-blue-600";
      case "prescription":
        return "bg-purple-500/10 text-purple-600";
      case "alert":
        return "bg-red-500/10 text-red-600";
      default:
        return "bg-gray-500/10 text-gray-600";
    }
  };

  const statsCards = [
    {
      title: "Today's Sales",
      value: formatCurrency(stats.dailySalesRevenue, storeProfile?.currency),
      comparison: salesComparison,
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

  if (stock_batchStats.loading && !salesToday.length) {
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
    <div className="space-y-4">
      <DashboardStats statsCards={statsCards} />

      <DashboardActionCenter
        expiringCount={stats.expiringSoon}
        lowStockCount={stats.lowStockCount}
      />

      <div className="flex flex-col lg:grid lg:grid-cols-[1.4fr_1fr] gap-5">
        <div className="order-2 lg:order-1">
          <DashboardRecentActivity
            activities={activities}
            storeTerm={t("store")}
            getActivityColor={getActivityColor}
            onActivityClick={(activity) => {
              if (activity.type === "sale" && activity.rawSale) {
                setSelectedSale(activity.rawSale);
              }
            }}
          />
        </div>

        <div className="order-1 lg:order-2">
          <DashboardQuickActions productTerm={t("product")} />
        </div>
      </div>

      <TransactionDetailsDialog
        sale={selectedSale}
        open={!!selectedSale}
        onOpenChange={(open) => !open && setSelectedSale(null)}
        currencyCode={storeProfile?.currency}
      />
    </div>
  );
}
