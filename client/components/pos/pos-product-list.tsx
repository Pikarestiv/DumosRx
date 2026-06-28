"use client";

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { PackageX, Plus, AlertCircle, Sparkles, Clock, Star } from "lucide-react";
import { formatCurrency } from "@/lib/utils";

interface POSProductListProps {
  loadingProducts: boolean;
  filteredProducts: any[];
  productsLength: number;
  addToCart: (product: any) => void;
  productTerm: string;
  currencyCode?: string;
  isFuzzyFallback?: boolean;
  suggestions?: any[];
  recentlySoldIds?: string[];
  commonlySoldIds?: string[];
}

export function POSProductList({
  loadingProducts,
  filteredProducts,
  productsLength,
  addToCart,
  productTerm,
  currencyCode,
  isFuzzyFallback,
  suggestions = [],
  recentlySoldIds = [],
  commonlySoldIds = []
}: POSProductListProps) {
  // Segment the products for prioritization
  const suggestionsSet = new Set(suggestions.map((s) => s.id));
  const recentSet = new Set(recentlySoldIds);
  const commonSet = new Set(commonlySoldIds);

  const suggestionsList: any[] = [];
  const recentlySoldList: any[] = [];
  const commonlySoldList: any[] = [];
  const remainingList: any[] = [];

  filteredProducts.forEach((product) => {
    if (suggestionsSet.has(product.id)) {
      suggestionsList.push({ ...product, posGroup: "suggestion" });
    } else if (recentSet.has(product.id)) {
      recentlySoldList.push({ ...product, posGroup: "recent" });
    } else if (commonSet.has(product.id)) {
      commonlySoldList.push({ ...product, posGroup: "common" });
    } else {
      remainingList.push({ ...product, posGroup: "standard" });
    }
  });

  // Combine lists, keeping prioritized groups at the top
  const sortedProducts = [
    ...suggestionsList,
    ...recentlySoldList,
    ...commonlySoldList,
    ...remainingList,
  ];

  return (
    <Card>
      <CardHeader>
        <CardTitle className="font-serif font-semibold">
          Available {productTerm}
        </CardTitle>
        <CardDescription>
          {loadingProducts
            ? "Loading..."
            : `Showing ${filteredProducts.length} of ${productsLength} ${productTerm.toLowerCase()}`}
        </CardDescription>
      </CardHeader>
      <CardContent>
        {isFuzzyFallback && filteredProducts.length > 0 && (
          <div className="mb-4 bg-amber-500/10 border border-amber-500/20 text-amber-600 px-4 py-3 rounded-lg flex items-center gap-3">
            <AlertCircle className="h-5 w-5 shrink-0" />
            <div>
              <p className="font-bold text-sm">Did you mean?</p>
              <p className="text-xs opacity-80">No exact matches found. Showing closest names.</p>
            </div>
          </div>
        )}

        {loadingProducts ? (
          <div className="grid grid-cols-2 md:grid-cols-2 gap-3">
            {[...Array(4)].map((_, i) => (
              <div key={i} className="p-3 border rounded-lg space-y-2">
                <Skeleton className="h-4 w-3/4" />
                <Skeleton className="h-3 w-1/2" />
                <Skeleton className="h-4 w-1/3" />
              </div>
            ))}
          </div>
        ) : filteredProducts.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-12 text-muted-foreground">
            <PackageX className="h-12 w-12 mb-4" />
            <p className="font-medium">No {productTerm.toLowerCase()} found</p>
            <p className="text-sm">
              Try a different search term or add {productTerm.toLowerCase()} to stock_batch.
            </p>
          </div>
        ) : (
          <div className="grid grid-cols-2 md:grid-cols-2 gap-3 max-h-[28rem] overflow-y-auto pr-1">
            {sortedProducts.map((product) => {
              let indicator = null;
              let cardStyle = "border-border hover:bg-muted/50";

              if (product.posGroup === "suggestion") {
                indicator = (
                  <div className="flex items-center gap-0.5 text-[9px] font-semibold text-amber-600 bg-amber-500/10 px-1 py-0.5 rounded shadow-sm">
                    <Sparkles className="h-2.5 w-2.5 text-amber-500 fill-amber-500/20" />
                    <span>Suggested</span>
                  </div>
                );
                cardStyle = "border-amber-500/30 bg-amber-500/5 hover:bg-amber-500/10";
              } else if (product.posGroup === "recent") {
                indicator = (
                  <div className="flex items-center gap-0.5 text-[9px] font-semibold text-blue-600 bg-blue-500/10 px-1 py-0.5 rounded shadow-sm">
                    <Clock className="h-2.5 w-2.5 text-blue-500" />
                    <span>Recent</span>
                  </div>
                );
                cardStyle = "border-blue-500/25 bg-blue-500/5 hover:bg-blue-500/10";
              } else if (product.posGroup === "common") {
                indicator = (
                  <div className="flex items-center gap-0.5 text-[9px] font-semibold text-yellow-700 bg-yellow-500/10 px-1 py-0.5 rounded shadow-sm">
                    <Star className="h-2.5 w-2.5 text-yellow-500 fill-yellow-500/20" />
                    <span>Popular</span>
                  </div>
                );
                cardStyle = "border-yellow-500/25 bg-yellow-500/5 hover:bg-yellow-500/10";
              }

              return (
                <div
                  key={product.id}
                  className={`relative p-3 border rounded-lg cursor-pointer transition-all duration-200 shadow-sm ${cardStyle}`}
                  onClick={() => addToCart(product)}
                >
                  <div className="absolute top-2 right-2 z-10">
                    {indicator}
                  </div>
                  <div className="flex items-center justify-between">
                    <div className="flex-1 pr-14">
                      <h4 className="font-medium text-sm truncate">{product.name}</h4>
                      <p className="text-xs text-muted-foreground truncate">
                        {product.brand || "Brand"} • {product.strength || "Strength"}
                      </p>
                      <div className="flex items-center gap-2 mt-1">
                        <span className="font-bold text-accent">
                          {formatCurrency(product.unit_price, currencyCode)}
                        </span>
                        <Badge
                          variant={
                            product.stock > 10
                              ? "default"
                              : product.stock > 0
                                ? "outline"
                                : "destructive"
                          }
                          className="text-[10px] px-1 py-0"
                        >
                          {product.stock}
                        </Badge>
                      </div>
                    </div>
                    <Button size="sm" variant="ghost" className="h-8 w-8 p-0 shrink-0">
                      <Plus className="h-4 w-4" />
                    </Button>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
