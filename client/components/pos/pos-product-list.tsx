"use client";

import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import {
  PackageX,
  Package,
  Plus,
  AlertCircle,
  Sparkles,
  Clock,
  Star,
} from "lucide-react";
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

function POSProductCard({
  product,
  currencyCode,
  addToCart,
}: {
  product: any;
  currencyCode?: string;
  addToCart: (product: any) => void;
}) {
  let indicator = null;
  let cardStyle = "border-border/60 hover:border-primary/40 bg-card hover:bg-muted/30";

  if (product.posGroup === "suggestion") {
    indicator = (
      <div className="absolute -top-2.5 -right-2.5 z-10 flex items-center justify-center gap-1 text-[10px] font-bold text-amber-700 bg-amber-100 border-2 border-background px-2 py-0.5 rounded-full shadow-sm">
        <Sparkles className="h-3 w-3" />
        <span>Suggested</span>
      </div>
    );
    cardStyle = "border-amber-200/50 bg-amber-50/30 hover:bg-amber-50/80";
  } else if (product.posGroup === "recent") {
    indicator = (
      <div className="absolute -top-2.5 -right-2.5 z-10 flex items-center justify-center gap-1 text-[10px] font-bold text-blue-700 bg-blue-100 border-2 border-background px-2 py-0.5 rounded-full shadow-sm">
        <Clock className="h-3 w-3" />
        <span>Recent</span>
      </div>
    );
    cardStyle = "border-blue-200/50 bg-blue-50/30 hover:bg-blue-50/80";
  } else if (product.posGroup === "common") {
    indicator = (
      <div className="absolute -top-2.5 -right-2.5 z-10 flex items-center justify-center gap-1 text-[10px] font-bold text-yellow-800 bg-yellow-100 border-2 border-background px-2 py-0.5 rounded-full shadow-sm">
        <Star className="h-3 w-3 fill-yellow-600" />
        <span>Popular</span>
      </div>
    );
    cardStyle = "border-yellow-200/50 bg-yellow-50/30 hover:bg-yellow-50/80";
  }

  const isLowStock = product.stock > 0 && product.stock <= (product.reorder_level || 10);
  const isOutOfStock = product.stock === 0;

  return (
    <div
      className={`relative p-3 border rounded-2xl cursor-pointer transition-all duration-200 shadow-[0_1px_3px_rgba(0,0,0,0.02)] flex flex-col ${cardStyle} ${isOutOfStock ? "opacity-60 grayscale-[0.5]" : ""}`}
      onClick={() => addToCart(product)}
    >
      {indicator}
      
      {/* Icon Area */}
      <div className="w-full h-14 rounded-xl bg-primary/5 text-primary/70 flex items-center justify-center mb-2.5">
        <Package className="h-5 w-5" />
      </div>

      <div className="text-[13px] font-semibold leading-tight mb-1 line-clamp-2">
        {product.name}
      </div>
      <div className="text-[11px] text-muted-foreground truncate mb-2">
        {product.brand || "Generic"} • {product.strength || "-"}
      </div>

      <div className="flex items-center justify-between mt-auto pt-1">
        <div className="text-[13.5px] font-bold text-primary">
          {formatCurrency(product.unit_price, currencyCode)}
        </div>
        <div className={`text-[10px] font-bold px-2 py-0.5 rounded-md ${
          isOutOfStock 
            ? "bg-destructive/10 text-destructive" 
            : isLowStock
              ? "bg-amber-500/10 text-amber-600"
              : "bg-emerald-500/10 text-emerald-600"
        }`}>
          {isOutOfStock ? "Out of stock" : `${product.stock} left`}
        </div>
      </div>
    </div>
  );
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
  commonlySoldIds = [],
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
    <div className="space-y-3 pt-3 pr-3">
      {isFuzzyFallback && filteredProducts.length > 0 && (
        <div className="mb-2 bg-amber-500/10 border border-amber-500/20 text-amber-600 px-4 py-3 rounded-lg flex items-center gap-3">
          <AlertCircle className="h-5 w-5 shrink-0" />
          <div>
            <p className="font-bold text-sm">Did you mean?</p>
            <p className="text-xs opacity-80">
              No exact matches found. Showing closest names.
            </p>
          </div>
        </div>
      )}

      {loadingProducts ? (
        <div className="grid grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-3">
          {[...Array(8)].map((_, i) => (
            <div key={i} className="p-3 border rounded-2xl space-y-2 h-[120px]">
              <Skeleton className="h-10 w-full rounded-xl" />
              <Skeleton className="h-3 w-1/2" />
              <Skeleton className="h-4 w-1/3" />
            </div>
          ))}
        </div>
      ) : filteredProducts.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-12 text-muted-foreground border border-dashed rounded-2xl border-border bg-card/50">
          <PackageX className="h-12 w-12 mb-4" />
          <p className="font-medium">No {productTerm.toLowerCase()} found</p>
          <p className="text-sm">
            Try a different search term or add {productTerm.toLowerCase()} to
            stock batch.
          </p>
        </div>
      ) : (
        <div className="grid grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-3">
          {sortedProducts.map((product) => (
            <POSProductCard
              key={product.id}
              product={product}
              currencyCode={currencyCode}
              addToCart={addToCart}
            />
          ))}
        </div>
      )}
    </div>
  );
}
