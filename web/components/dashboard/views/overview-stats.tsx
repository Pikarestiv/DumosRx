"use client";

import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { TrendingUp, Store, Package, Users } from "lucide-react";

interface OverviewStatsProps {
  stats: any;
}

export function OverviewStats({ stats }: OverviewStatsProps) {
  const statCards = [
    {
      name: "Total Fleet Sales",
      value: `₦${(stats?.total_sales?.value || 0).toLocaleString()}`,
      change: stats?.total_sales?.growth,
      icon: TrendingUp,
      color: "text-green-600",
      bg: "bg-green-100 dark:bg-green-900/20",
    },
    {
      name: "Active Stores",
      value: `${stats?.stores_count || 0}`,
      change: stats?.last_sync === "Never" ? "Offline" : "Online",
      icon: Store,
      color: "text-blue-600",
      bg: "bg-blue-100 dark:bg-blue-900/20",
    },
    {
      name: "StockBatch Value",
      value: `₦${(stats?.stock_batch_value?.value || 0).toLocaleString()}`,
      change: "Live Stock",
      icon: Package,
      color: "text-purple-600",
      bg: "bg-purple-100 dark:bg-purple-900/20",
    },
    {
      name: "Fleet Customers",
      value: `${(stats?.customers?.value || 0).toLocaleString()}`,
      change: stats?.customers?.growth,
      icon: Users,
      color: "text-indigo-600",
      bg: "bg-indigo-100 dark:bg-indigo-900/20",
    },
  ];

  return (
    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
      {statCards.map((stat, i) => (
        <Card key={i} className="border border-border/50 shadow-[0_0_24px_rgba(0,0,0,0.06)] hover:shadow-[0_0_32px_rgba(0,0,0,0.1)] transition-shadow dark:shadow-none">
          <CardContent className="p-6">
            <div className="flex items-center justify-between mb-4">
              <div className={`${stat.bg} p-3 rounded-2xl`}>
                <stat.icon className={`h-6 w-6 ${stat.color}`} />
              </div>
              <Badge variant="secondary" className="bg-muted font-bold">
                {stat.change}
              </Badge>
            </div>
            <div>
              <p className="text-sm font-semibold text-muted-foreground uppercase tracking-wider">{stat.name}</p>
              <h3 className="text-xl sm:text-2xl font-black mt-1">{stat.value}</h3>
            </div>
          </CardContent>
        </Card>
      ))}
    </div>
  );
}
