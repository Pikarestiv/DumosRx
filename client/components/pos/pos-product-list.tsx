"use client";

import { useMemo, useState } from "react";
import { Skeleton } from "@/components/ui/skeleton";
import { EmptyState } from "@/components/ui/empty-state";
import {
  PackageX,
  Package,
  AlertCircle,
  Sparkles,
  Clock,
  Lock,
} from "lucide-react";
import { RequestItemDialog } from "@/components/pos/request-item-dialog";
import { VirtualizedProductGrid } from "@/components/pos/pos-virtualized-product-grid";
import type { POSProduct } from "@/lib/types/product";
import type { CartItem } from "@/lib/hooks/use-pos-cart";
import { HorizontalScrollFade } from "@/components/ui/scroll-fade";

import { POSProductCard, type GroupedProduct } from "./pos-product-card";

export { POSProductCard, type GroupedProduct } from "./pos-product-card";

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
  /** True when the catalog read itself failed, as opposed to succeeding with
   * zero rows — the two render different states (see docs/UX-PERF-FIXES.md). */
  productsLoadFailed?: boolean;
  onRetryLoadProducts?: () => void;
  // Shared scroll container this list renders inside of — see VirtualizedProductGrid's own doc comment for why it can't crea…
  // Rationale: docs/CLIENT_COMMENTS.md#block-components-pos-pos-product-list-tsx-L46
  scrollElementRef: React.RefObject<HTMLDivElement | null>;
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
  productsLoadFailed = false,
  onRetryLoadProducts,
  scrollElementRef,
}: POSProductListProps) {
  const [showRequestDialog, setShowRequestDialog] = useState(false);

  // O(1) lookups; memoized for a stable reference (see POSProductCard's memo() below).
  const cartQuantityMap = useMemo(
    () => new Map(cart.map((item) => [item.id, item.quantity])),
    [cart],
  );

  // Segment/sort for prioritization - the O(catalog size) part; memoized.
  const {
    suggestionsList,
    recentlySoldList,
    commonlySoldList,
    remainingList,
    sortedProducts,
    commonAndRemainingList,
  } = useMemo(() => {
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

    return {
      suggestionsList,
      recentlySoldList,
      commonlySoldList,
      remainingList,
      sortedProducts,
      commonAndRemainingList: [...commonlySoldList, ...remainingList],
    };
  }, [filteredProducts, suggestions, recentlySoldIds, commonlySoldIds]);

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

      {!loadingProducts && productsLoadFailed && (
        <div className="border border-dashed rounded-2xl border-destructive/40 bg-destructive/5">
          <EmptyState
            icon={AlertCircle}
            title={`Couldn't load ${productTerm.toLowerCase()} on this device`}
            description="The catalog couldn't be read from this device's local database. Nothing is lost — try again."
            action={
              onRetryLoadProducts
                ? { label: "Retry", onClick: onRetryLoadProducts }
                : undefined
            }
          />
        </div>
      )}

      {!loadingProducts && !productsLoadFailed && filteredProducts.length === 0 && (
        <div className="border border-dashed rounded-2xl border-border bg-card/50">
          <EmptyState
            icon={PackageX}
            title={`No ${productTerm.toLowerCase()} found`}
            description={`Try a different search term or add ${productTerm.toLowerCase()} to stock batch.`}
            action={{
              label: "Request Product",
              onClick: () => setShowRequestDialog(true),
            }}
          />
        </div>
      )}

      <RequestItemDialog
        open={showRequestDialog}
        onOpenChange={setShowRequestDialog}
        initialProductName={searchTerm}
      />

      {!loadingProducts &&
        filteredProducts.length > 0 &&
        searchTerm.trim().length > 0 && (
          <VirtualizedProductGrid
            products={sortedProducts}
            currencyCode={currencyCode}
            addToCart={addToCart}
            cartQuantityMap={cartQuantityMap}
            displayStockLevels={displayStockLevels}
            scrollElementRef={scrollElementRef}
          />
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
                <button
                  type="button"
                  onClick={onUpgradeClick}
                  className="w-full bg-primary/5 border border-primary/10 rounded-xl p-4 flex flex-col items-center justify-center text-center cursor-pointer hover:bg-primary/10 transition-colors outline-none focus-visible:ring-[3px] focus-visible:ring-ring"
                >
                  <Lock className="h-5 w-5 text-primary mb-2" />
                  <p className="text-sm font-semibold text-primary">
                    Unlock Smart Suggestions
                  </p>
                  <p className="text-xs text-muted-foreground mt-1 max-w-[250px]">
                    Upgrade your plan to automatically recommend related
                    products based on the customer's cart.
                  </p>
                </button>
              )}
              {canUseSmartSuggestions && suggestionsList.length > 0 && (
                <HorizontalScrollFade className="flex gap-3 overflow-x-auto pb-2 px-4 mx-0 sm:px-0 hide-scrollbar snap-x snap-mandatory">
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
                </HorizontalScrollFade>
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
                <HorizontalScrollFade className="flex gap-3 overflow-x-auto pb-2 px-4 mx-0 sm:px-0 hide-scrollbar snap-x snap-mandatory">
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
                </HorizontalScrollFade>
              </div>
            )}

            {/* All Products */}
            {(commonlySoldList.length > 0 || remainingList.length > 0) && (
              <div>
                <div className="flex items-center gap-1.5 text-[13px] font-semibold text-muted-foreground mb-3">
                  <Package className="h-3.5 w-3.5 text-gray-500" />
                  All products
                </div>
                <VirtualizedProductGrid
                  products={commonAndRemainingList}
                  currencyCode={currencyCode}
                  addToCart={addToCart}
                  cartQuantityMap={cartQuantityMap}
                  displayStockLevels={displayStockLevels}
                  scrollElementRef={scrollElementRef}
                />
              </div>
            )}
          </div>
        )}
    </div>
  );
}
