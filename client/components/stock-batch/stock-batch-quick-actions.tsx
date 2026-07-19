"use client";

import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  ShoppingCart,
  Package,
  Calendar,
  BarChart3,
  AlertTriangle,
  TrendingDown,
  PlusCircle,
} from "lucide-react";
import Link from "next/link";
import { useStore } from "@/lib/context/store-context";

interface StockBatchQuickActionsProps {
  criticalItems: number;
  lowStockCount: number;
}

function QuickActionCard({ action }: { action: any }) {
  const content = (
    <>
      <div className="p-3 rounded-2xl sm:rounded-xl w-16 h-16 sm:w-auto sm:h-auto border border-primary/20 sm:border-none bg-background sm:bg-primary/10 shadow-sm sm:shadow-none text-primary group-hover:bg-primary/15 transition-transform flex items-center justify-center">
        <action.icon className="h-5 w-5 sm:h-4 sm:w-4" />
      </div>
      <span className="text-xs sm:text-sm font-medium sm:font-semibold text-foreground mt-1">
        {action.label}
      </span>
    </>
  );

  const className =
    "shrink-0 snap-start w-[94px] sm:w-auto p-1 sm:p-4 bg-transparent sm:bg-card border-none sm:border-solid sm:border sm:border-border rounded-xl transition-all flex flex-col items-center sm:items-start cursor-pointer group outline-none text-center sm:text-left hover:bg-primary/5 sm:hover:border-primary/50";

  return (
    <Link href={action.href} className={className}>
      {content}
    </Link>
  );
}

export function StockBatchQuickActions({
  criticalItems,
  lowStockCount,
}: StockBatchQuickActionsProps) {
  const { t } = useStore();

  const items = [
    {
      label: `Add ${t("product")}`,
      icon: PlusCircle,
      href: "/inventory/products",
    },
    {
      label: "Create P.O.",
      icon: ShoppingCart,
      href: "/procurement",
    },
    {
      label: "Stock Adjustment",
      icon: Package,
      href: "/inventory/adjustments",
    },
    {
      label: "Expiry Report",
      icon: Calendar,
      href: "/inventory/batches",
    },
    {
      label: "Stock Report",
      icon: BarChart3,
      href: "/reports",
    },
  ];

  return (
    <Card className="border-none shadow-none bg-transparent sm:border-solid sm:border-border sm:shadow-sm sm:bg-card pb-0 !gap-0 sm:gap-6">
      <CardHeader className="px-0 sm:px-6 pb-3 sm:pb-6">
        <CardTitle className="font-serif font-semibold !px-0">
          Quick Actions
        </CardTitle>
        <CardDescription className="hidden sm:block mt-1">
          Common inventory management tasks
        </CardDescription>
      </CardHeader>
      <CardContent className="p-0 sm:px-4 pt-0">
        <div className="flex overflow-x-auto sm:grid sm:grid-cols-2 gap-1 sm:gap-4 pb-0 hide-scrollbar snap-x snap-mandatory -mx-4 sm:mx-0 px-4 sm:px-0">
          {items.map((item) => (
            <QuickActionCard key={item.label} action={item} />
          ))}
        </div>

        <div className="mt-6 space-y-3">
          {criticalItems > 0 && (
            <div className="p-3 bg-destructive/10 border border-destructive/20 rounded-lg">
              <div className="flex items-center gap-2">
                <AlertTriangle className="h-4 w-4 text-destructive" />
                <span className="text-sm font-medium text-destructive">
                  Urgent Reorders Required
                </span>
              </div>
              <p className="text-xs text-destructive/80 mt-1">
                {criticalItems} items are critically low and need immediate
                restocking
              </p>
            </div>
          )}

          {lowStockCount > 0 && (
            <div className="p-3 bg-orange-50 dark:bg-orange-950/30 border border-orange-200 dark:border-orange-900 rounded-lg">
              <div className="flex items-center gap-2">
                <TrendingDown className="h-4 w-4 text-orange-600 dark:text-orange-400" />
                <span className="text-sm font-medium text-orange-800 dark:text-orange-300">
                  Low Stock Warning
                </span>
              </div>
              <p className="text-xs text-orange-600 dark:text-orange-400 mt-1">
                {lowStockCount} items are approaching reorder levels
              </p>
            </div>
          )}
        </div>
      </CardContent>
    </Card>
  );
}
