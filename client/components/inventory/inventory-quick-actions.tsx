"use client";

import { 
  Card, 
  CardContent, 
  CardDescription, 
  CardHeader, 
  CardTitle 
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { 
  ShoppingCart, 
  Package, 
  Calendar, 
  BarChart3, 
  AlertTriangle, 
  TrendingDown 
} from "lucide-react";

interface InventoryQuickActionsProps {
  criticalItems: number;
  lowStockCount: number;
}

export function InventoryQuickActions({
  criticalItems,
  lowStockCount
}: InventoryQuickActionsProps) {
  return (
    <Card>
      <CardHeader>
        <CardTitle className="font-serif font-semibold">
          Quick Actions
        </CardTitle>
        <CardDescription>Common inventory management tasks</CardDescription>
      </CardHeader>
      <CardContent>
        <div className="grid grid-cols-2 gap-3">
          <Button
            variant="outline"
            className="h-20 flex flex-col gap-2 bg-transparent"
          >
            <ShoppingCart className="h-6 w-6 hover-rotate-icon" />
            <span className="text-sm">Create Purchase Order</span>
          </Button>
          <Button
            variant="outline"
            className="h-20 flex flex-col gap-2 bg-transparent"
          >
            <Package className="h-6 w-6 hover-rotate-icon" />
            <span className="text-sm">Stock Adjustment</span>
          </Button>
          <Button
            variant="outline"
            className="h-20 flex flex-col gap-2 bg-transparent"
          >
            <Calendar className="h-6 w-6 hover-rotate-icon" />
            <span className="text-sm">Expiry Report</span>
          </Button>
          <Button
            variant="outline"
            className="h-20 flex flex-col gap-2 bg-transparent"
          >
            <BarChart3 className="h-6 w-6 hover-rotate-icon" />
            <span className="text-sm">Inventory Report</span>
          </Button>
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
