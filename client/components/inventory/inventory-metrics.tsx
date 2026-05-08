"use client";

import { Card, CardContent } from "@/components/ui/card";
import { 
  DollarSign, 
  AlertTriangle, 
  TrendingDown, 
  Calendar 
} from "lucide-react";

import { useStore } from "@/lib/context/store-context";

interface InventoryMetricsProps {
  inventoryValue: number;
  criticalItems: number;
  lowStockCount: number;
  expiringCount: number;
  formatCurrency: (amount: number) => string;
}

export function InventoryMetrics({
  inventoryValue,
  criticalItems,
  lowStockCount,
  expiringCount,
  formatCurrency
}: InventoryMetricsProps) {
  const { storeProfile } = useStore();
  const expiryDays = storeProfile?.expiry_warning_days || 90;

  return (
    <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
      <Card>
        <CardContent className="p-4 hover-scale">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm text-muted-foreground">
                Total Inventory Value
              </p>
              <p className="text-2xl font-bold">
                {formatCurrency(inventoryValue)}
              </p>
            </div>
            <div className="h-8 w-8 bg-primary/10 rounded-full flex items-center justify-center">
              <DollarSign className="h-4 w-4 text-primary" />
            </div>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardContent className="p-4 hover-scale">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm text-muted-foreground">
                Critical Stock Items
              </p>
              <p className="text-2xl font-bold text-destructive">
                {criticalItems}
              </p>
            </div>
            <div className="h-8 w-8 bg-destructive/10 rounded-full flex items-center justify-center">
              <AlertTriangle className="h-4 w-4 text-destructive hover-rotate-icon" />
            </div>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardContent className="p-4 hover-scale">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm text-muted-foreground">Low Stock Items</p>
              <p className="text-2xl font-bold text-orange-600 dark:text-orange-400">
                {lowStockCount}
              </p>
            </div>
            <div className="h-8 w-8 bg-orange-100 dark:bg-orange-950/30 rounded-full flex items-center justify-center">
              <TrendingDown className="h-4 w-4 text-orange-600 dark:text-orange-400 hover-rotate-icon" />
            </div>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardContent className="p-4 hover-scale">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm text-muted-foreground">
                Expiring Soon ({expiryDays}d)
              </p>
              <p className="text-2xl font-bold text-blue-600 dark:text-blue-400">
                {expiringCount}
              </p>
            </div>
            <div className="h-8 w-8 bg-blue-100 dark:bg-blue-950/30 rounded-full flex items-center justify-center">
              <Calendar className="h-4 w-4 text-blue-600 dark:text-blue-400 hover-rotate-icon" />
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
