"use client";

import {
  Card,
  CardContent,
  CardHeader,
} from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Package,
  ShoppingCart,
  AlertTriangle,
  TrendingUp,
} from "lucide-react";
import { useLocalData } from "@/lib/db/hooks/useLocalData";
import { useStore } from "@/lib/context/store-context";
import { DashboardStats } from "./dashboard-stats";
import { DashboardRecentActivity } from "./dashboard-recent-activity";
import { DashboardQuickActions } from "./dashboard-quick-actions";
import { EODSummaryDialog } from "./eod-summary-dialog";
import { useState } from "react";

interface ActivityItem {
  id: string;
  type: string;
  message: string;
  timestamp: string;
}

export function DashboardOverview() {
  const { t, storeProfile } = useStore();
  const [showEOD, setShowEOD] = useState(false);
  
  const { data: medicines } = useLocalData<{ count: number }>(
    'SELECT COUNT(*) as count FROM medicines WHERE is_active = 1 AND _deleted = 0',
  );

  const { data: salesToday } = useLocalData<{ total: number; count: number; cash: number; card: number; debt: number }>(
    `SELECT 
      SUM(total_amount) as total, 
      COUNT(*) as count,
      SUM(CASE WHEN payment_method = 'cash' THEN total_amount ELSE 0 END) as cash,
      SUM(CASE WHEN payment_method = 'card' THEN total_amount ELSE 0 END) as card,
      SUM(CASE WHEN payment_method = 'credit' THEN total_amount ELSE 0 END) as debt
     FROM sales 
     WHERE date(transaction_date) = date('now') AND _deleted = 0`,
  );

  const { data: topStaff } = useLocalData<{ name: string; total: number }>(
    `SELECT u.name, SUM(s.total_amount) as total 
     FROM sales s 
     JOIN users u ON s.cashier_id = u.id 
     WHERE date(s.transaction_date) = date('now') AND s._deleted = 0 
     GROUP BY u.name 
     ORDER BY total DESC 
     LIMIT 1`
  );

  const { data: expiring } = useLocalData<{ count: number }>(
    `SELECT (
      (SELECT COUNT(*) FROM medicines WHERE date(expiry_date) <= date('now', '+30 days') AND _deleted = 0) +
      (SELECT COUNT(*) FROM inventory WHERE date(expiry_date) <= date('now', '+30 days') AND _deleted = 0)
    ) as count`
  );

  const { data: lowStock } = useLocalData<{ count: number }>(
    "SELECT COUNT(*) as count FROM medicines WHERE stock_quantity <= reorder_level AND _deleted = 0",
  );

  const { data: recentSales } = useLocalData<any>(
    "SELECT * FROM sales WHERE _deleted = 0 ORDER BY created_at DESC LIMIT 5"
  );

  const stats = {
    totalMedicines: medicines[0]?.count || 0,
    dailySalesRevenue: salesToday[0]?.total || 0,
    expiringSoon: expiring[0]?.count || 0,
    lowStockCount: lowStock[0]?.count || 0,
  };

  const eodSummary = {
    totalSales: salesToday[0]?.total || 0,
    cashSales: salesToday[0]?.cash || 0,
    cardSales: salesToday[0]?.card || 0,
    debtSales: salesToday[0]?.debt || 0,
    transactionCount: salesToday[0]?.count || 0,
    topStaff: topStaff[0] || { name: "No sales yet", total: 0 }
  };

  const activities: ActivityItem[] = recentSales.map((sale: any) => ({
    id: sale.id,
    type: "sale",
    message: `${t('product')} sale: ${sale.transaction_number}`,
    timestamp: sale.created_at,
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
        return "bg-accent";
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
      title: `Total ${t('products')}`,
      value: stats.totalMedicines.toLocaleString(),
      description: `Active ${t('products').toLowerCase()} in stock`,
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
      description: "Items expiring in 30 days",
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

  if (!medicines.length && !salesToday.length) {
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
        <h1 className="font-serif font-bold text-3xl text-foreground">
          Dashboard Overview
        </h1>
        <p className="text-muted-foreground mt-2">
          Monitor your {t('store').toLowerCase()} operations and key metrics
        </p>
      </div>

      <DashboardStats statsCards={statsCards} />

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <DashboardRecentActivity 
          activities={activities}
          storeTerm={t('store')}
          getActivityColor={getActivityColor}
        />

        <DashboardQuickActions 
          storeTerm={t('store')}
          productTerm={t('product')}
          onCloseRegister={() => setShowEOD(true)}
        />
      </div>

      <EODSummaryDialog 
        open={showEOD} 
        onOpenChange={setShowEOD} 
        summary={eodSummary}
        currencyCode={storeProfile?.currency}
      />
    </div>
  );
}
