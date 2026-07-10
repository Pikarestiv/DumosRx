"use client";

import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { getLocalTodayDate } from "@/lib/utils";
import { Skeleton } from "@/components/ui/skeleton";
import { Package, ShoppingCart, AlertTriangle, TrendingUp } from "lucide-react";
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

export function DashboardOverview() {
  const { t, storeProfile } = useStore();
  const { user } = useAuth();
  const [selectedSale, setSelectedSale] = useState<any>(null);

  // Single source of truth for all stock-batch-related stat cards
  const stock_batchStats = useStockBatchStats();

  const isRestrictedRole = user?.role === "sales_staff" || user?.role === "specialist";
  const { data: dashboardData } = useQuery({
    queryKey: ['dashboardOverviewData', user?.id, isRestrictedRole],
    queryFn: () => getDashboardOverviewData(user?.id, isRestrictedRole)
  });

  const salesToday = dashboardData?.salesToday ? [dashboardData.salesToday] : [];
  const refundsToday = dashboardData?.refundsToday ? [dashboardData.refundsToday] : [];
  const recentSales = dashboardData?.recentSales || [];

  const expiryDays = storeProfile?.expiry_warning_days || 30;

  const stats = {
    totalProducts: stock_batchStats.activeProducts,
    dailySalesRevenue: (salesToday[0]?.total || 0) - (refundsToday[0]?.total || 0),
    expiringSoon: stock_batchStats.expiringSoonCount,
    lowStockCount: stock_batchStats.lowStockCount,
  };

  const activities = recentSales.map((sale: any) => ({
    id: sale.id,
    type: "sale",
    message: `${t("product")} sale: ${sale.transaction_number}`,
    timestamp: sale.created_at,
    rawSale: sale,
  }));

  const formatCurrency = (amount: number) => {
    return new Intl.NumberFormat("en-NG", {
      style: "currency",
      currency: storeProfile?.currency || "NGN",
      minimumFractionDigits: 0,
    }).format(amount);
  };

  const getActivityColor = (type: string) => {
    switch (type) {
      case "sale":
        return "bg-primary";
      case "restock":
        return "bg-primary";
      case "alert":
        return "bg-destructive";
      default:
        return "bg-muted-foreground";
    }
  };

  const statsCards = [
    {
      title: `Total ${t("products")}`,
      value: stats.totalProducts.toLocaleString(),
      description: `Active ${t("products").toLowerCase()} in stock`,
      icon: Package,
      trend: "In database",
      colorScheme: "blue" as const,
    },
    {
      title: "Daily Sales",
      value: formatCurrency(stats.dailySalesRevenue),
      description: "Today's revenue",
      icon: ShoppingCart,
      trend: "Today",
      colorScheme: "green" as const,
    },
    {
      title: "Expiring Soon",
      value: String(stats.expiringSoon),
      description: `Items expiring in ${expiryDays} days`,
      icon: AlertTriangle,
      trend: stats.expiringSoon > 0 ? "Requires attention" : "All clear",
      colorScheme: "red" as const,
    },
    {
      title: "Low Stock",
      value: String(stats.lowStockCount),
      description: "Items below reorder level",
      icon: TrendingUp,
      trend: stats.lowStockCount > 0 ? "Needs restock" : "Healthy",
      colorScheme: "amber" as const,
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
      <div>
        <p className="text-primary font-medium mb-1">
          Welcome back, {user?.first_name || "User"}
        </p>
        <h1 className="font-serif font-bold text-3xl text-foreground">
          Dashboard Overview
        </h1>
        <p className="text-muted-foreground mt-1">
          Monitor your {t("store").toLowerCase()} operations and key metrics
        </p>
      </div>

      <DashboardActionCenter
        expiringCount={stats.expiringSoon}
        lowStockCount={stats.lowStockCount}
      />

      <DashboardStats statsCards={statsCards} isCompact={true} />

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
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

        <DashboardQuickActions
          storeTerm={t("store")}
          productTerm={t("product")}
        />
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
