"use client";

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { PackageX, Plus, AlertCircle } from "lucide-react";
import { formatCurrency } from "@/lib/utils";

interface POSProductListProps {
  loadingMedicines: boolean;
  filteredMedicines: any[];
  medicinesLength: number;
  addToCart: (medicine: any) => void;
  productTerm: string;
  currencyCode?: string;
  isFuzzyFallback?: boolean;
}

export function POSProductList({
  loadingMedicines,
  filteredMedicines,
  medicinesLength,
  addToCart,
  productTerm,
  currencyCode,
  isFuzzyFallback
}: POSProductListProps) {
  return (
    <Card>
      <CardHeader>
        <CardTitle className="font-serif font-semibold">
          Available {productTerm}
        </CardTitle>
        <CardDescription>
          {loadingMedicines
            ? "Loading..."
            : `Showing ${filteredMedicines.length} of ${medicinesLength} ${productTerm.toLowerCase()}`}
        </CardDescription>
      </CardHeader>
      <CardContent>
        {isFuzzyFallback && filteredMedicines.length > 0 && (
          <div className="mb-4 bg-amber-500/10 border border-amber-500/20 text-amber-600 px-4 py-3 rounded-lg flex items-center gap-3">
            <AlertCircle className="h-5 w-5 shrink-0" />
            <div>
              <p className="font-bold text-sm">Did you mean?</p>
              <p className="text-xs opacity-80">No exact matches found. Showing closest names.</p>
            </div>
          </div>
        )}

        {loadingMedicines ? (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            {[...Array(4)].map((_, i) => (
              <div key={i} className="p-3 border rounded-lg space-y-2">
                <Skeleton className="h-4 w-3/4" />
                <Skeleton className="h-3 w-1/2" />
                <Skeleton className="h-4 w-1/3" />
              </div>
            ))}
          </div>
        ) : filteredMedicines.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-12 text-muted-foreground">
            <PackageX className="h-12 w-12 mb-4" />
            <p className="font-medium">No {productTerm.toLowerCase()} found</p>
            <p className="text-sm">
              Try a different search term or add {productTerm.toLowerCase()} to inventory.
            </p>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3 max-h-96 overflow-y-auto">
            {filteredMedicines.map((medicine) => (
              <div
                key={medicine.id}
                className="p-3 border border-border rounded-lg hover:bg-muted/50 cursor-pointer transition-colors"
                onClick={() => addToCart(medicine)}
              >
                <div className="flex items-center justify-between">
                  <div className="flex-1">
                    <h4 className="font-medium text-sm">{medicine.name}</h4>
                    <p className="text-xs text-muted-foreground">
                      {medicine.brand} • {medicine.strength}
                    </p>
                    <div className="flex items-center gap-2 mt-1">
                      <span className="font-bold text-accent">
                        {formatCurrency(medicine.unit_price, currencyCode)}
                      </span>
                      <Badge
                        variant={
                          medicine.stock > 10
                            ? "default"
                            : medicine.stock > 0
                              ? "outline"
                              : "destructive"
                        }
                        className="text-xs"
                      >
                        {medicine.stock} in stock
                      </Badge>
                    </div>
                  </div>
                  <Button size="sm" variant="ghost" className="ml-2">
                    <Plus className="h-4 w-4" />
                  </Button>
                </div>
              </div>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
