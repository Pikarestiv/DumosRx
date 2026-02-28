"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Package,
  ShoppingCart,
  AlertTriangle,
  TrendingUp,
  Clock,
  Activity,
} from "lucide-react";
import { useLocalData } from "@/lib/db/hooks/useLocalData";
import { useStore } from "@/lib/context/store-context";

interface DashboardStats {
  totalMedicines: number;
  dailySalesRevenue: number;
  expiringSoon: number;
  lowStockCount: number;
}

interface ActivityItem {
  id: string;
  type: string;
  message: string;
  timestamp: string;
}

export function DashboardOverview() {
  const { t } = useStore();
  // Fetch stats directly from local SQLite
  const { data: medicines } = useLocalData<{ count: number }>(
    'SELECT COUNT(*) as count FROM medicines WHERE is_active = 1 AND _deleted = 0',
  );

  const { data: salesToday } = useLocalData<{ total: number }>(
    "SELECT SUM(total) as total FROM sales WHERE date(created_at) = date('now') AND _deleted = 0",
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

  const activities: ActivityItem[] = recentSales.map((sale: any) => ({
    id: sale.id,
    type: "sale",
    message: `${t('product')} sale: ${sale.transaction_number}`,
    timestamp: sale.created_at,
  }));
  const loading = false; // Instant load from local DB

  const formatCurrency = (amount: number) => {
    return new Intl.NumberFormat("en-NG", {
      style: "currency",
      currency: "NGN",
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

  if (loading) {
    return (
      <div className="space-y-6">
        <div>
          <h1 className="font-serif font-bold text-3xl text-foreground">
            Dashboard Overview
          </h1>
          <p className="text-muted-foreground mt-2">
            Monitor your pharmacy operations and key metrics
          </p>
        </div>

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
          <Card className="border-border">
            <CardHeader>
              <Skeleton className="h-6 w-32" />
              <Skeleton className="h-4 w-48" />
            </CardHeader>
            <CardContent className="space-y-4">
              {[...Array(3)].map((_, i) => (
                <div
                  key={i}
                  className="flex items-center gap-3 p-3 bg-muted rounded-lg"
                >
                  <Skeleton className="w-2 h-2 rounded-full" />
                  <div className="flex-1 space-y-2">
                    <Skeleton className="h-4 w-40" />
                    <Skeleton className="h-3 w-32" />
                  </div>
                  <Skeleton className="h-3 w-16" />
                </div>
              ))}
            </CardContent>
          </Card>

          <Card className="border-border">
            <CardHeader>
              <Skeleton className="h-6 w-28" />
              <Skeleton className="h-4 w-40" />
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-2 gap-3">
                {[...Array(4)].map((_, i) => (
                  <Skeleton key={i} className="h-20 w-full" />
                ))}
              </div>
            </CardContent>
          </Card>
        </div>
      </div>
    );
  }

  const statsCards = [
    {
      title: `Total ${t('products')}`,
      value: stats?.totalMedicines.toLocaleString() || "0",
      description: `Active ${t('products').toLowerCase()} in stock`,
      icon: Package,
      trend: "In database",
    },
    {
      title: "Daily Sales",
      value: formatCurrency(stats?.dailySalesRevenue || 0),
      description: "Today's revenue",
      icon: ShoppingCart,
      trend: "Today",
    },
    {
      title: "Expiring Soon",
      value: stats?.expiringSoon.toString() || "0",
      description: "Items expiring in 30 days",
      icon: AlertTriangle,
      trend:
        stats?.expiringSoon && stats.expiringSoon > 0
          ? "Requires attention"
          : "All clear",
    },
    {
      title: "Low Stock",
      value: stats?.lowStockCount.toString() || "0",
      description: "Items below reorder level",
      icon: TrendingUp,
      trend:
        stats?.lowStockCount && stats.lowStockCount > 0
          ? "Needs restock"
          : "Healthy",
    },
  ];

  return (
    <div className="space-y-6">
      <div>
        <h1 className="font-serif font-bold text-3xl text-foreground">
          Dashboard Overview
        </h1>
        <p className="text-muted-foreground mt-2">
          Monitor your pharmacy operations and key metrics
        </p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
        {statsCards.map((stat) => (
          <Card key={stat.title} className="border-border">
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium text-muted-foreground">
                {stat.title}
              </CardTitle>
              <stat.icon className="h-4 w-4 text-accent" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold text-foreground">
                {stat.value}
              </div>
              <p className="text-xs text-muted-foreground mt-1">
                {stat.description}
              </p>
              <p className="text-xs text-accent mt-2">{stat.trend}</p>
            </CardContent>
          </Card>
        ))}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <Card className="border-border">
          <CardHeader>
            <CardTitle className="font-serif font-semibold">
              Recent Activity
            </CardTitle>
            <CardDescription>
              Latest pharmacy transactions and updates
            </CardDescription>
          </CardHeader>
          <CardContent>
            {activities.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-8 text-muted-foreground">
                <Activity className="h-8 w-8 mb-2 opacity-50" />
                <p className="text-sm">No recent activity</p>
                <p className="text-xs">
                  Activities will appear here as they happen
                </p>
              </div>
            ) : (
              <div className="space-y-4">
                {activities.map((activity) => (
                  <div
                    key={activity.id}
                    className="flex items-center gap-3 p-3 bg-muted rounded-lg"
                  >
                    <div
                      className={`w-2 h-2 ${getActivityColor(activity.type)} rounded-full`}
                    ></div>
                    <div className="flex-1">
                      <p className="text-sm font-medium">{activity.message}</p>
                    </div>
                    <span className="text-xs text-muted-foreground">
                      {new Date(activity.timestamp).toLocaleTimeString()}
                    </span>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>

        <Card className="border-border">
          <CardHeader>
            <CardTitle className="font-serif font-semibold">
              Quick Actions
            </CardTitle>
            <CardDescription>Common pharmacy management tasks</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-2 gap-3">
              <Link
                href="/medicines"
                className="p-4 bg-accent text-accent-foreground rounded-lg hover:bg-accent/90 transition-colors flex flex-col items-center justify-center text-center cursor-pointer"
              >
                <Package className="h-6 w-6 mb-2" />
                <span className="text-sm font-medium">Add {t('product')}</span>
              </Link>
              <Link
                href="/pos"
                className="p-4 bg-primary text-primary-foreground rounded-lg hover:bg-primary/90 transition-colors flex flex-col items-center justify-center text-center cursor-pointer"
              >
                <ShoppingCart className="h-6 w-6 mb-2" />
                <span className="text-sm font-medium">New Sale</span>
              </Link>
              <Link
                href="/inventory"
                className="p-4 bg-secondary text-secondary-foreground rounded-lg hover:bg-secondary/90 transition-colors flex flex-col items-center justify-center text-center cursor-pointer"
              >
                <AlertTriangle className="h-6 w-6 mb-2" />
                <span className="text-sm font-medium">Check Expiry</span>
              </Link>
              <Link
                href="/reports"
                className="p-4 bg-muted text-muted-foreground rounded-lg hover:bg-muted/80 transition-colors flex flex-col items-center justify-center text-center cursor-pointer"
              >
                <TrendingUp className="h-6 w-6 mb-2" />
                <span className="text-sm font-medium">View Reports</span>
              </Link>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
