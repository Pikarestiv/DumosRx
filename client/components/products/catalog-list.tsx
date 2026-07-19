import React from "react";
import { Package } from "lucide-react";
import { Product } from "./types";

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
  return (
    <div className="flex flex-col h-full min-h-0">
      {isFuzzyFallback && filteredProducts.length > 0 && (
        <div className="bg-amber-500/10 text-amber-600 px-4 py-2 text-sm border-b border-amber-500/20 text-center font-medium">
          Did you mean? (No exact matches found. Showing closest names.)
        </div>
      )}

      {/* Header */}
      <div className="grid grid-cols-[1fr_110px_90px_100px_90px] gap-2 px-4 py-2.5 text-[11px] font-bold text-muted-foreground uppercase tracking-wide border-b border-border shrink-0">
        <div>Product</div>
        <div className="hidden sm:block">Category</div>
        <div className="hidden sm:block">Price</div>
        <div>Stock</div>
        <div className="hidden sm:block">Reorder</div>
      </div>

      {/* Rows */}
      <div className="flex-1 overflow-y-auto hide-scrollbar">
        {filteredProducts.length === 0 ? (
          <div className="h-32 flex flex-col items-center justify-center text-muted-foreground">
            <Package className="h-8 w-8 mb-2 opacity-50" />
            <p className="font-medium">No products found</p>
            <p className="text-sm">
              {totalCount === 0
                ? "Add your first product to get started"
                : "Try adjusting your search or filters"}
            </p>
          </div>
        ) : (
          filteredProducts.map((product) => {
            const isSelected = selectedProductId === product.id;
            return (
              <div
                key={product.id}
                onClick={() => onSelectProduct(product)}
                className={`grid grid-cols-[1fr_110px_90px_100px_90px] gap-2 px-4 py-3 items-center border-b border-border cursor-pointer transition-colors ${
                  isSelected ? "bg-primary/5 border-l-2 border-l-primary" : "hover:bg-muted/50 border-l-2 border-l-transparent"
                }`}
              >
                <div className="min-w-0 pr-2">
                  <div className="text-[13px] font-semibold truncate">{product.name}</div>
                  <div className="text-[11px] text-muted-foreground truncate">{product.barcode || product.id.slice(0,8)}</div>
                </div>
                <div className="hidden sm:block">
                  <span className="text-[11px] font-semibold bg-primary/10 text-primary px-2 py-0.5 rounded-md truncate max-w-[100px] inline-block">
                    {product.category || "Uncategorized"}
                  </span>
                </div>
                <div className="hidden sm:block text-[13px] font-semibold">
                  {formatCurrency(product.sellingPrice)}
                </div>
                <div className={`text-[13px] font-semibold ${product.stockQuantity <= product.reorderLevel ? 'text-destructive' : 'text-primary'}`}>
                  {product.stockQuantity} {product.baseUnit || 'units'}
                </div>
                <div className="hidden sm:block text-[13px] text-muted-foreground">
                  {product.reorderLevel}
                </div>
              </div>
            );
          })
        )}
      </div>
    </div>
  );
}
