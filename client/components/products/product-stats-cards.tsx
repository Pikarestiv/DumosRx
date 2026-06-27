import React from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Search, Eye, AlertTriangle } from "lucide-react";

interface ProductStatsCardsProps {
  totalCount: number;
  activeCount: number;
  lowStockCount: number;
  expiredCount: number;
  productsLabel: string;
}

export function ProductStatsCards({
  totalCount,
  activeCount,
  lowStockCount,
  expiredCount,
  productsLabel,
}: ProductStatsCardsProps) {
  return (
    <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
      <Card>
        <CardContent className="p-4">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm text-muted-foreground">Total {productsLabel}</p>
              <p className="text-2xl font-bold">{totalCount}</p>
            </div>
            <div className="h-8 w-8 bg-accent/10 rounded-full flex items-center justify-center">
              <Search className="h-4 w-4 text-accent pointer-events-none" />
            </div>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardContent className="p-4">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm text-muted-foreground">
                Active {productsLabel}
              </p>
              <p className="text-2xl font-bold">
                {activeCount}
              </p>
            </div>
            <div className="h-8 w-8 bg-primary/10 rounded-full flex items-center justify-center">
              <Eye className="h-4 w-4 text-primary" />
            </div>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardContent className="p-4">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm text-muted-foreground">Low Stock</p>
              <p className="text-2xl font-bold text-destructive">{lowStockCount}</p>
            </div>
            <div className="h-8 w-8 bg-destructive/10 rounded-full flex items-center justify-center">
              <AlertTriangle className="h-4 w-4 text-destructive" />
            </div>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardContent className="p-4">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm text-muted-foreground">Expired</p>
              <p className="text-2xl font-bold text-destructive">{expiredCount}</p>
            </div>
            <div className="h-8 w-8 bg-destructive/10 rounded-full flex items-center justify-center">
              <AlertTriangle className="h-4 w-4 text-destructive" />
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
