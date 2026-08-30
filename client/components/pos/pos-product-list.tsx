"use client";

import { Skeleton } from "@/components/ui/skeleton";
import {
  PackageX,
  Package,
  AlertCircle,
  Sparkles,
  Clock,
  Star,
  Lock,
} from "lucide-react";
import { formatCurrency } from "@/lib/utils";
import { getCategoryIcon } from "@/lib/constants/category-icons";
import type { POSProduct } from "@/lib/types/product";
import type { CartItem } from "@/lib/hooks/use-pos-cart";

type PosGroup = "suggestion" | "recent" | "common" | "standard";
type GroupedProduct = POSProduct & { posGroup: PosGroup };

interface POSProductListProps {
  loadingProducts: boolean;
  filteredProducts: POSProduct[];
  addToCart: (product: POSProduct) => void;
  productTerm: string;
  searchTerm?: string;
  currencyCode?: string;
  isFuzzyFallback?: boolean;
  suggestions?: POSProduct[];
  recentlySoldIds?: string[];
  commonlySoldIds?: string[];
  cart?: CartItem[];
  canUseSmartSuggestions?: boolean;
  onUpgradeClick?: () => void;
  displayStockLevels?: boolean;
}

function POSProductCard({
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

  const isLowStock =
    product.stock > 0 && product.stock <= (product.reorder_level || 10);
  const isOutOfStock = product.stock === 0;
  const CategoryIcon = getCategoryIcon(product.category_name);

  return (
    <div
      className={`relative p-2 sm:p-3 border rounded-xl sm:rounded-2xl cursor-pointer transition-all duration-200 shadow-[0_1px_3px_rgba(0,0,0,0.02)] flex flex-col ${cardStyle} ${isOutOfStock ? "opacity-60 grayscale-[0.5]" : ""}`}
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
        <CategoryIcon className="h-4 w-4 sm:h-5 sm:w-5" />
      </div>

      <div className="text-[11.5px] sm:text-[13px] font-semibold leading-tight mb-0.5 sm:mb-1 line-clamp-2">
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
                : isLowStock
                  ? "bg-amber-500/10 text-amber-600"
                  : "bg-emerald-500/10 text-emerald-600"
            }`}
          >
            {isOutOfStock ? "Out of stock" : `${product.stock} left`}
          </div>
        )}
      </div>
    </div>
  );
}

export function POSProductList({
  loadingProducts,
  filteredProducts,
  addToCart,
  productTerm,
  searchTerm = "",
  currencyCode,
  isFuzzyFallback,
  suggestions = [],
  recentlySoldIds = [],
  commonlySoldIds = [],
  cart = [],
  canUseSmartSuggestions = false,
  onUpgradeClick,
  displayStockLevels = true,
}: POSProductListProps) {
  // Use a map for O(1) lookups
  const cartQuantityMap = new Map(
    cart.map((item) => [item.id, item.quantity]),
  );

  // Segment the products for prioritization
  const suggestionsSet = new Set(suggestions.map((s) => s.id));
  const recentSet = new Set(recentlySoldIds);
  const commonSet = new Set(commonlySoldIds);

  const suggestionsList: GroupedProduct[] = [];
  const recentlySoldList: GroupedProduct[] = [];
  const commonlySoldList: GroupedProduct[] = [];
  const remainingList: GroupedProduct[] = [];

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
    <div className=" pb-19">
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

      {loadingProducts && (
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-3 xl:grid-cols-4 gap-2 sm:gap-3">
          {[...Array(8)].map((_, i) => (
            <div
              key={i}
              className="p-2 sm:p-3 border rounded-xl sm:rounded-2xl space-y-1.5 sm:space-y-2 h-[100px] sm:h-[120px]"
            >
              <Skeleton className="h-10 w-full rounded-xl" />
              <Skeleton className="h-3 w-1/2" />
              <Skeleton className="h-4 w-1/3" />
            </div>
          ))}
        </div>
      )}

      {!loadingProducts && filteredProducts.length === 0 && (
        <div className="flex flex-col items-center justify-center py-12 text-muted-foreground border border-dashed rounded-2xl border-border bg-card/50">
          <PackageX className="h-12 w-12 mb-4" />
          <p className="font-medium">No {productTerm.toLowerCase()} found</p>
          <p className="text-sm">
            Try a different search term or add {productTerm.toLowerCase()} to
            stock batch.
          </p>
        </div>
      )}

      {!loadingProducts &&
        filteredProducts.length > 0 &&
        searchTerm.trim().length > 0 && (
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-3 xl:grid-cols-4 gap-2 sm:gap-3">
            {sortedProducts.map((product) => (
              <POSProductCard
                key={product.id}
                product={product}
                currencyCode={currencyCode}
                addToCart={addToCart}
                cartQuantity={cartQuantityMap.get(product.id) || 0}
                displayStockLevels={displayStockLevels}
              />
            ))}
          </div>
        )}

      {!loadingProducts &&
        filteredProducts.length > 0 &&
        searchTerm.trim().length === 0 && (
          <div className="flex flex-col gap-6">
            {/* Smart Suggestions */}
            <div>
              <div className="flex items-center gap-1.5 text-[13px] font-semibold text-muted-foreground mb-3">
                <Sparkles className="h-3.5 w-3.5 text-amber-500" />
                Goes well with cart
              </div>

              {!canUseSmartSuggestions && (
                <div
                  onClick={onUpgradeClick}
                  className="bg-primary/5 border border-primary/10 rounded-xl p-4 flex flex-col items-center justify-center text-center cursor-pointer hover:bg-primary/10 transition-colors"
                >
                  <Lock className="h-5 w-5 text-primary mb-2" />
                  <p className="text-sm font-semibold text-primary">
                    Unlock Smart Suggestions
                  </p>
                  <p className="text-xs text-muted-foreground mt-1 max-w-[250px]">
                    Upgrade your plan to automatically recommend related
                    products based on the customer's cart.
                  </p>
                </div>
              )}
              {canUseSmartSuggestions && suggestionsList.length > 0 && (
                <div className="flex gap-3 overflow-x-auto pb-2 px-4 mx-0 sm:px-0 hide-scrollbar snap-x snap-mandatory">
                  {suggestionsList.map((product) => (
                    <div
                      key={product.id}
                      className="w-[150px] sm:w-[170px] shrink-0 snap-start"
                    >
                      <POSProductCard
                        product={product}
                        currencyCode={currencyCode}
                        addToCart={addToCart}
                        cartQuantity={cartQuantityMap.get(product.id) || 0}
                        displayStockLevels={displayStockLevels}
                      />
                    </div>
                  ))}
                </div>
              )}
              {canUseSmartSuggestions && suggestionsList.length === 0 && (
                <div className="text-xs text-muted-foreground py-3 italic px-4 bg-muted/30 rounded-xl border border-dashed text-center">
                  Add items to cart to see smart suggestions
                </div>
              )}
            </div>

            {/* Recently Sold */}
            {recentlySoldList.length > 0 && (
              <div>
                <div className="flex items-center gap-1.5 text-[13px] font-semibold text-muted-foreground mb-3">
                  <Clock className="h-3.5 w-3.5 text-blue-500" />
                  Recently sold
                </div>
                <div className="flex gap-3 overflow-x-auto pb-2 px-4 mx-0 sm:px-0 hide-scrollbar snap-x snap-mandatory">
                  {recentlySoldList.map((product) => (
                    <div
                      key={product.id}
                      className="w-[150px] sm:w-[170px] shrink-0 snap-start"
                    >
                      <POSProductCard
                        product={product}
                        currencyCode={currencyCode}
                        addToCart={addToCart}
                        cartQuantity={cartQuantityMap.get(product.id) || 0}
                        displayStockLevels={displayStockLevels}
                      />
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* All Products */}
            {(commonlySoldList.length > 0 || remainingList.length > 0) && (
              <div>
                <div className="flex items-center gap-1.5 text-[13px] font-semibold text-muted-foreground mb-3">
                  <Package className="h-3.5 w-3.5 text-gray-500" />
                  All products
                </div>
                <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-3 xl:grid-cols-4 gap-2 sm:gap-3">
                  {[...commonlySoldList, ...remainingList].map((product) => (
                    <POSProductCard
                      key={product.id}
                      product={product}
                      currencyCode={currencyCode}
                      addToCart={addToCart}
                      cartQuantity={cartQuantityMap.get(product.id) || 0}
                      displayStockLevels={displayStockLevels}
                    />
                  ))}
                </div>
              </div>
            )}
          </div>
        )}
    </div>
  );
}
