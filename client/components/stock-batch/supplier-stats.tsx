"use client";

import { Card, CardContent } from "@/components/ui/card";

interface SupplierStatsProps {
  totalSuppliers: number;
  activeSuppliers: number;
  totalValue: number;
  avgRating: number;
  ratingStars: string;
  formatCurrency: (amount: number) => string;
}

export function SupplierStats({
  totalSuppliers,
  activeSuppliers,
  totalValue,
  avgRating,
  ratingStars,
  formatCurrency
}: SupplierStatsProps) {
  return (
    <div className="-mx-4 sm:mx-0 px-4 sm:px-0">
      <div className="flex overflow-x-auto sm:grid sm:grid-cols-3 gap-[10px] sm:gap-4 pb-4 sm:pb-0 hide-scrollbar snap-x snap-mandatory">
        <Card className="min-w-[140px] sm:min-w-0 snap-center shrink-0 border-border">
          <CardContent className="p-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-xs sm:text-sm text-muted-foreground">Total Suppliers</p>
                <p className="text-xl sm:text-2xl font-bold">{totalSuppliers}</p>
              </div>
              <div className="text-right shrink-0">
                <p className="text-[11px] sm:text-xs text-muted-foreground">Active</p>
                <p className="text-sm sm:text-base font-semibold text-primary">
                  {activeSuppliers}
                </p>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card className="min-w-[140px] sm:min-w-0 snap-center shrink-0 border-border">
          <CardContent className="p-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-xs sm:text-sm text-muted-foreground">
                  Total Purchase Value
                </p>
                <p className="text-xl sm:text-2xl font-bold">
                  {formatCurrency(totalValue)}
                </p>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card className="min-w-[140px] sm:min-w-0 snap-center shrink-0 border-border">
          <CardContent className="p-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-xs sm:text-sm text-muted-foreground">Average Rating</p>
                <p className="text-xl sm:text-2xl font-bold">
                  {avgRating.toFixed(1)}
                </p>
              </div>
              <div className="text-right shrink-0">
                <p className="text-[11px] sm:text-xs text-muted-foreground">Stars</p>
                <p className="text-sm sm:text-base">
                  {ratingStars}
                </p>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
