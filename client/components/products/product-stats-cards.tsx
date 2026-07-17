import React from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Search, Eye, AlertTriangle } from "lucide-react";

interface ProductStatsCardsProps {
  totalCount: number;
  activeCount: number;
  lowStockCount: number;
  outOfStockCount: number;
  expiredCount: number;
  productsLabel: string;
}

export function ProductStatsCards({
  totalCount,
  activeCount,
  lowStockCount,
  outOfStockCount,
  expiredCount,
  productsLabel,
}: ProductStatsCardsProps) {
  return (
    <div className="-mx-4 sm:mx-0 px-4 sm:px-0">
      <div className="flex overflow-x-auto sm:grid sm:grid-cols-3 lg:grid-cols-5 gap-[10px] sm:gap-4 pb-4 sm:pb-0 hide-scrollbar snap-x snap-mandatory">
        <Card className="min-w-[140px] sm:min-w-0 snap-center shrink-0 border-border">
          <CardContent className="p-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-xs sm:text-sm text-muted-foreground">Total {productsLabel}</p>
                <p className="text-xl sm:text-2xl font-bold">{totalCount}</p>
              </div>
              <div className="h-8 w-8 bg-accent/10 rounded-full flex items-center justify-center shrink-0">
                <Search className="h-4 w-4 text-accent pointer-events-none" />
              </div>
            </div>
          </CardContent>
        </Card>

        <Card className="min-w-[140px] sm:min-w-0 snap-center shrink-0 border-border">
          <CardContent className="p-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-xs sm:text-sm text-muted-foreground">
                  Active {productsLabel}
                </p>
                <p className="text-xl sm:text-2xl font-bold">
                  {activeCount}
                </p>
              </div>
              <div className="h-8 w-8 bg-primary/10 rounded-full flex items-center justify-center shrink-0">
                <Eye className="h-4 w-4 text-primary" />
              </div>
            </div>
          </CardContent>
        </Card>

        <Card className="min-w-[140px] sm:min-w-0 snap-center shrink-0 border-border">
          <CardContent className="p-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-xs sm:text-sm text-muted-foreground">Low Stock</p>
                <p className="text-xl sm:text-2xl font-bold text-destructive">{lowStockCount}</p>
              </div>
              <div className="h-8 w-8 bg-destructive/10 rounded-full flex items-center justify-center shrink-0">
                <AlertTriangle className="h-4 w-4 text-destructive" />
              </div>
            </div>
          </CardContent>
        </Card>

        <Card className="min-w-[140px] sm:min-w-0 snap-center shrink-0 border-border">
          <CardContent className="p-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-xs sm:text-sm text-muted-foreground">Out of Stock</p>
                <p className="text-xl sm:text-2xl font-bold text-destructive">{outOfStockCount}</p>
              </div>
              <div className="h-8 w-8 bg-destructive/10 rounded-full flex items-center justify-center shrink-0">
                <AlertTriangle className="h-4 w-4 text-destructive" />
              </div>
            </div>
          </CardContent>
        </Card>

        <Card className="min-w-[140px] sm:min-w-0 snap-center shrink-0 border-border">
          <CardContent className="p-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-xs sm:text-sm text-muted-foreground">Expired</p>
                <p className="text-xl sm:text-2xl font-bold text-destructive">{expiredCount}</p>
              </div>
              <div className="h-8 w-8 bg-destructive/10 rounded-full flex items-center justify-center shrink-0">
                <AlertTriangle className="h-4 w-4 text-destructive" />
              </div>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
