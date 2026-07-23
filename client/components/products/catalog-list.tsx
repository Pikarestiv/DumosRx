import React from "react";
import { Package, ChevronRight } from "lucide-react";
import { Product } from "./types";
import { useStore } from "@/lib/context/store-context";

interface CatalogListProps {
  filteredProducts: Product[];
  totalCount: number;
  isFuzzyFallback: boolean;
  formatCurrency: (amount: number) => string;
  onSelectProduct: (product: Product) => void;
  selectedProductId?: string;
}

export function CatalogList({
  filteredProducts,
  totalCount,
  isFuzzyFallback,
  formatCurrency,
  onSelectProduct,
  selectedProductId,
}: CatalogListProps) {
  const { storeType } = useStore();
  const isPharmacy = storeType === "pharmacy";

  return (
    <div className="flex flex-col h-full min-h-0">
      {isFuzzyFallback && filteredProducts.length > 0 && (
        <div className="bg-amber-500/10 text-amber-600 px-4 py-2 text-sm border-b border-amber-500/20 text-center font-medium">
          Did you mean? (No exact matches found. Showing closest names.)
        </div>
      )}

      {/* Header */}
      <div className="hidden sm:grid grid-cols-[1fr_110px_90px_100px_90px] gap-2 px-4 py-2.5 text-[11px] font-bold text-muted-foreground uppercase tracking-wide border-b border-border shrink-0">
        <div>Product</div>
        <div>Category</div>
        <div>Price</div>
        <div>Stock</div>
        <div>Reorder</div>
      </div>

      {/* Rows */}
      <div className="flex-1 overflow-y-auto hide-scrollbar">
        {filteredProducts.length === 0 && (
          <EmptyCatalogList totalCount={totalCount} />
        )}
        {filteredProducts.length > 0 &&
          filteredProducts.map((product) => {
            const isSelected = selectedProductId === product.id;
            return (
              <div
                key={product.id}
                onClick={() => onSelectProduct(product)}
                className={`px-4 py-3 border-b border-border cursor-pointer transition-colors ${
                  isSelected
                    ? "bg-primary/5 border-l-2 border-l-primary"
                    : "hover:bg-muted/50 border-l-2 border-l-transparent"
                }`}
              >
                {/* Mobile View */}
                <div className="flex sm:hidden items-center justify-between">
                  <div className="min-w-0 pr-2 flex-1">
                    <div className="text-[15px] font-bold text-foreground truncate flex items-center gap-2">
                      {product.name}
                      {isPharmacy && !product.genericName && (
                        <span className="text-[10px] font-medium bg-amber-500/10 text-amber-600 px-1.5 py-0.5 rounded border border-amber-500/20" title="Missing Generic Name">
                          No Generic
                        </span>
                      )}
                    </div>
                    <div className="text-[13px] text-muted-foreground mt-0.5 truncate flex">
                      {product.barcode || product.id.slice(0, 8)} ·{" "}
                      {product.category || "Uncategorized"}
                    </div>
                  </div>
                  <div className="flex items-center gap-3 shrink-0">
                    <div className="flex flex-col items-end">
                      <div className="text-[15px] font-bold text-foreground">
                        {formatCurrency(product.sellingPrice)}
                      </div>
                      <div
                        className={`text-[13px] font-semibold mt-0.5 ${product.stockQuantity <= product.reorderLevel ? "text-orange-600" : "text-emerald-600"}`}
                      >
                        {product.stockQuantity} {product.baseUnit || "unit"}
                        {product.stockQuantity === 1 ? "" : "s"}
                      </div>
                    </div>
                    <ChevronRight className="w-4 h-4 text-muted-foreground/30" />
                  </div>
                </div>

                {/* Desktop View */}
                <div className="hidden sm:grid grid-cols-[1fr_110px_90px_100px_90px] gap-2 items-center">
                  <div className="min-w-0 pr-2">
                    <div className="text-[13px] font-semibold truncate flex items-center gap-2">
                      {product.name}
                      {isPharmacy && !product.genericName && (
                        <span className="text-[9px] font-medium bg-amber-500/10 text-amber-600 px-1.5 py-0.5 rounded border border-amber-500/20" title="Missing Generic Name">
                          No Generic
                        </span>
                      )}
                    </div>
                    <div className="text-[11px] text-muted-foreground truncate">
                      {product.barcode || product.id.slice(0, 8)}
                    </div>
                  </div>
                  <div className="flex items-center">
                    <span className="text-[11px] font-semibold bg-primary/10 text-primary px-2 py-0.5 rounded-md truncate max-w-[100px] inline-block">
                      {product.category || "Uncategorized"}
                    </span>
                  </div>
                  <div className="text-[13px] font-semibold">
                    {formatCurrency(product.sellingPrice)}
                  </div>
                  <div
                    className={`text-[13px] font-semibold ${product.stockQuantity <= product.reorderLevel ? "text-destructive" : "text-primary"}`}
                  >
                    {product.stockQuantity} {product.baseUnit || "unit"}
                    {product.stockQuantity === 1 ? "" : "s"}
                  </div>
                  <div className="text-[13px] text-muted-foreground">
                    {product.reorderLevel}
                  </div>
                </div>
              </div>
            );
          })}
      </div>
    </div>
  );
}

function EmptyCatalogList({ totalCount }: { totalCount: number }) {
  return (
    <div className="h-32 flex flex-col items-center justify-center text-muted-foreground">
      <Package className="h-8 w-8 mb-2 opacity-50" />
      <p className="font-medium">No products found</p>
      <p className="text-sm">
        {totalCount === 0
          ? "Add your first product to get started"
          : "Try adjusting your search or filters"}
      </p>
    </div>
  );
}
