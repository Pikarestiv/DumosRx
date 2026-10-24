"use client";

import { memo } from "react";
import { Sparkles, Clock, Star } from "lucide-react";
import { formatCurrency } from "@/lib/utils";
import type { POSProduct } from "@/lib/types/product";
import { useUppercaseDisplayClass } from "@/lib/hooks/use-uppercase-display";
import { useStockVisibility } from "@/lib/hooks/use-stock-visibility";
import { stockLevel } from "@/lib/utils/stock-status";
import { CategoryIcon } from "./category-icon";

type PosGroup = "suggestion" | "recent" | "common" | "standard";
export type GroupedProduct = POSProduct & { posGroup: PosGroup };

export const POSProductCard = memo(function POSProductCard({
  product,
  currencyCode,
  addToCart,
  cartQuantity = 0,
  displayStockLevels = true,
}: {
  product: GroupedProduct;
  currencyCode?: string;
  addToCart: (product: POSProduct) => void;
  cartQuantity?: number;
  displayStockLevels?: boolean;
}) {
  let indicator = null;
  let cardStyle =
    "border-border/60 hover:border-primary/40 bg-card hover:bg-muted/30";

  if (product.posGroup === "suggestion") {
    indicator = (
      <div className="absolute top-2 left-2 z-10 flex items-center justify-center gap-1 text-[9px] font-bold text-amber-700 bg-amber-50/90 backdrop-blur-md border border-amber-200/50 px-1.5 py-0.5 rounded-full shadow-sm">
        <Sparkles className="h-2.5 w-2.5" />
        <span>Suggested</span>
      </div>
    );
    cardStyle = "border-amber-200/50 bg-amber-50/30 hover:bg-amber-50/80";
  } else if (product.posGroup === "recent") {
    indicator = (
      <div className="absolute top-2 left-2 z-10 flex items-center justify-center gap-1 text-[9px] font-bold text-blue-700 bg-blue-50/90 backdrop-blur-md border border-blue-200/50 px-1.5 py-0.5 rounded-full shadow-sm">
        <Clock className="h-2.5 w-2.5" />
        <span>Recent</span>
      </div>
    );
    cardStyle = "border-blue-200/50 bg-blue-50/30 hover:bg-blue-50/80";
  } else if (product.posGroup === "common") {
    indicator = (
      <div className="absolute top-2 left-2 z-10 flex items-center justify-center gap-1 text-[9px] font-bold text-yellow-800 bg-yellow-50/90 backdrop-blur-md border border-yellow-200/50 px-1.5 py-0.5 rounded-full shadow-sm">
        <Star className="h-2.5 w-2.5 fill-yellow-600" />
        <span>Popular</span>
      </div>
    );
    cardStyle = "border-yellow-200/50 bg-yellow-50/30 hover:bg-yellow-50/80";
  }

  const { describeStock } = useStockVisibility();
  const level = stockLevel(product.stock, product.reorder_level);
  const isOutOfStock = level === "out";
  const capsClass = useUppercaseDisplayClass();

  return (
    <button
      type="button"
      // Not `disabled`: clicking an out-of-stock tile still surfaces the "This item is out of stock" toast, and a disabled butto…
      // Rationale: docs/CLIENT_COMMENTS.md#line-components-pos-pos-product-list-tsx-L104
      aria-disabled={isOutOfStock || undefined}
      className={`relative w-full text-left p-2 sm:p-3 border rounded-xl sm:rounded-2xl transition-all duration-200 shadow-[0_1px_3px_rgba(0,0,0,0.02)] flex flex-col outline-none focus-visible:ring-[3px] focus-visible:ring-ring focus-visible:border-ring ${cardStyle} ${isOutOfStock ? "opacity-60 grayscale-[0.5] cursor-not-allowed" : "cursor-pointer"}`}
      onClick={() => addToCart(product)}
    >
      {indicator}

      {cartQuantity > 0 && (
        <div className="absolute top-1.5 right-1.5 sm:top-2 sm:right-2 z-10 flex items-center justify-center min-w-[18px] h-[18px] sm:min-w-[22px] sm:h-[22px] px-1 text-[9px] sm:text-[10px] font-bold text-primary-foreground bg-primary shadow-sm rounded-full">
          {cartQuantity}
        </div>
      )}

      {/* Icon Area */}
      <div className="w-full h-10 sm:h-14 rounded-lg sm:rounded-xl bg-primary/5 text-primary/70 flex items-center justify-center mb-1.5 sm:mb-2.5">
        <CategoryIcon categoryName={product.category_name} className="h-4 w-4 sm:h-5 sm:w-5" />
      </div>

      <div className={`text-[11.5px] sm:text-[13px] font-semibold leading-tight mb-0.5 sm:mb-1 line-clamp-2 ${capsClass}`}>
        {product.name}
      </div>
      <div className="text-[10px] sm:text-[11px] text-muted-foreground truncate mb-1 sm:mb-2">
        {product.generic_name || "Generic"} • {product.strength || "-"}
      </div>

      <div className="flex items-center justify-between mt-auto pt-0.5 sm:pt-1">
        <div className="text-[12px] sm:text-[13.5px] font-bold text-primary">
          {formatCurrency(product.unit_price, currencyCode)}
        </div>
        {displayStockLevels && (
          <div
            className={`text-[9px] sm:text-[10px] font-bold px-1.5 sm:px-2 py-0.5 rounded-md ${
              isOutOfStock
                ? "bg-destructive/10 text-destructive"
                : level === "low"
                  ? "bg-amber-500/10 text-amber-600"
                  : "bg-emerald-500/10 text-emerald-600"
            }`}
          >
            {describeStock(product.stock, product.reorder_level)}
          </div>
        )}
      </div>
    </button>
  );
});
