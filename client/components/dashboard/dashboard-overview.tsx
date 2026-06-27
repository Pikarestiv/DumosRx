"use client";

import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { getLocalTodayDate } from "@/lib/utils";
import { Skeleton } from "@/components/ui/skeleton";
import { Package, ShoppingCart, AlertTriangle, TrendingUp } from "lucide-react";
import { useLocalData } from "@/lib/db/hooks/useLocalData";
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
  const userFilter = isRestrictedRole && user?.id ? ` AND user_id = '${user.id}'` : "";
  const userFilterAliasS = isRestrictedRole && user?.id ? ` AND s.user_id = '${user.id}'` : "";

  const { data: salesToday } = useLocalData<{
    total: number;
    count: number;
    cash: number;
    card: number;
    debt: number;
  }>(
    `SELECT 
      SUM(total_amount) as total, 
      COUNT(*) as count,
      SUM(CASE WHEN payment_method = 'cash' THEN total_amount ELSE 0 END) as cash,
      SUM(CASE WHEN payment_method = 'card' THEN total_amount ELSE 0 END) as card,
      SUM(CASE WHEN payment_method = 'credit' THEN total_amount ELSE 0 END) as debt
     FROM sales 
     WHERE date(transaction_date) = '${getLocalTodayDate()}' AND (_deleted = 0 OR _deleted IS NULL)${userFilter}`,
  );

  const { data: refundsToday } = useLocalData<{
    total: number;
    cash: number;
    card: number;
    debt: number;
  }>(
    `SELECT 
      SUM(r.total_refunded) as total,
      SUM(CASE WHEN s.payment_method = 'cash' OR s.payment_method = 'mixed' THEN r.total_refunded ELSE 0 END) as cash,
      SUM(CASE WHEN s.payment_method = 'card' THEN r.total_refunded ELSE 0 END) as card,
      SUM(CASE WHEN s.payment_method = 'credit' THEN r.total_refunded ELSE 0 END) as debt
     FROM returns r
     JOIN sales s ON r.sale_id = s.id
     WHERE date(r.created_at) = '${getLocalTodayDate()}' AND (r._deleted = 0 OR r._deleted IS NULL)${userFilterAliasS}`,
  );

  const { data: recentSales } = useLocalData<any>(
    `SELECT * FROM sales WHERE _deleted = 0${userFilter} ORDER BY created_at DESC LIMIT 5`,
  );

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
    },
    {
      title: "Daily Sales",
      value: formatCurrency(stats.dailySalesRevenue),
      description: "Today's revenue",
      icon: ShoppingCart,
      trend: "Today",
    },
    {
      title: "Expiring Soon",
      value: stats.expiringSoon.toString(),
      description: `Items expiring in ${expiryDays} days`,
      icon: AlertTriangle,
      trend: stats.expiringSoon > 0 ? "Requires attention" : "All clear",
    },
    {
      title: "Low Stock",
      value: stats.lowStockCount.toString(),
      description: "Items below reorder level",
      icon: TrendingUp,
      trend: stats.lowStockCount > 0 ? "Needs restock" : "Healthy",
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
    <div className="space-y-6">
      <div>
        <p className="text-primary font-medium mb-1">
          Welcome back, {user?.first_name || "User"}
        </p>
        <h1 className="font-serif font-bold text-3xl text-foreground">
          Dashboard Overview
        </h1>
        <p className="text-muted-foreground mt-2">
          Monitor your {t("store").toLowerCase()} operations and key metrics
        </p>
      </div>

      <DashboardActionCenter
        expiringCount={stats.expiringSoon}
        lowStockCount={stats.lowStockCount}
      />

      <DashboardStats statsCards={statsCards} />

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
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
