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
    <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
      <Card>
        <CardContent className="p-4">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm text-muted-foreground">Total Suppliers</p>
              <p className="text-2xl font-bold">{totalSuppliers}</p>
            </div>
            <div className="text-right">
              <p className="text-sm text-muted-foreground">Active</p>
              <p className="text-lg font-semibold text-primary">
                {activeSuppliers}
              </p>
            </div>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardContent className="p-4">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm text-muted-foreground">
                Total Purchase Value
              </p>
              <p className="text-2xl font-bold">
                {formatCurrency(totalValue)}
              </p>
            </div>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardContent className="p-4">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm text-muted-foreground">Average Rating</p>
              <p className="text-2xl font-bold">
                {avgRating.toFixed(1)}
              </p>
            </div>
            <div className="text-right">
              <p className="text-sm text-muted-foreground">Stars</p>
              <p className="text-lg">
                {ratingStars}
              </p>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
