import React, { useCallback, useMemo, useRef, useState } from "react";
import { AlertCircle, ChevronRight } from "lucide-react";
import { useVirtualizer } from "@tanstack/react-virtual";
import { useQuery } from "@tanstack/react-query";
import { toast } from "sonner";
import { Product } from "./types";
import { useStore } from "@/lib/context/store-context";
import { useAuth } from "@/lib/context/auth-context";
import { useHasPermission } from "@/lib/hooks/use-permissions";
import { SortableHeaderCell } from "@/components/ui/sortable-header-cell";
import { RequestItemDialog } from "@/components/pos/request-item-dialog";
import { CATALOG_GRID_COLS, CatalogRow } from "./catalog-row";
import { CatalogListSkeleton, EmptyCatalogList } from "./catalog-list-states";
import { EmptyState } from "@/components/ui/empty-state";
import { useQuickEditProductMutation } from "@/lib/hooks/use-product-quick-edit-mutation";
import { useSubmitStockAuditMutation } from "@/lib/hooks/use-stock-audit-mutation";
import { useHasTouchCapability } from "@/lib/hooks/use-has-touch-capability";
import { useMediaQuery } from "@/hooks/use-media-query";
import { useUppercaseDisplayClass } from "@/lib/hooks/use-uppercase-display";
import { getCategoryList } from "@/lib/db/queries/categories";
import { queryKeys } from "@/lib/query-keys";
import type { SortDirection } from "@/lib/hooks/use-sortable-data";
import { ScrollToTopButton } from "@/components/ui/scroll-to-top-button";

type ProductSortKey =
  | "name"
  | "category"
  | "costPrice"
  | "sellingPrice"
  | "stockQuantity"
  | "reorderLevel";

interface CatalogListProps {
  isLoading?: boolean;
  /** The catalog read itself failed, as opposed to returning zero rows. */
  loadFailed?: boolean;
  onRetryLoad?: () => void;
  filteredProducts: Product[];
  totalCount: number;
  isFuzzyFallback: boolean;
  formatCurrency: (amount: number) => string;
  onSelectProduct: (product: Product) => void;
  selectedProductId?: string;
  sortKey: ProductSortKey | null;
  sortDirection: SortDirection;
  onToggleSort: (key: ProductSortKey) => void;
  onProductUpdated: () => void;
}

export function CatalogList({
  isLoading = false,
  loadFailed = false,
  onRetryLoad,
  filteredProducts,
  totalCount,
  isFuzzyFallback,
  formatCurrency,
  onSelectProduct,
  selectedProductId,
  sortKey,
  sortDirection,
  onToggleSort,
  onProductUpdated,
}: CatalogListProps) {
  const { storeType } = useStore();
  const isPharmacy = storeType === "pharmacy";
  const { canManageStockBatch, isAdmin, user } = useAuth();
  const showCostColumn = useHasPermission("view_cost_fields");
  const canEditSellingPrice = useHasPermission("edit_product_price");
  const canAdjustStockQuantity = useHasPermission("adjust_stock_counts");
  const [showRequestDialog, setShowRequestDialog] = useState(false);
  // A 2-in-1 laptop's trackpad still lets it hover, but a user tapping its
  // touchscreen directly never fires :hover — so the edit pencil must stay
  // visible whenever touch is available at all, not just on touch-primary
  // devices (see useHasTouchCapability's doc comment for the distinction).
  const hasTouchCapability = useHasTouchCapability();
  const capsClass = useUppercaseDisplayClass();
  // Matches the sm: breakpoint the two row layouts used to be gated on in
  // CSS. useMediaQuery starts at `false` and corrects itself right after
  // mount, which is harmless here: the catalog's rows come from the local
  // database after mount, so there are none to render on that first pass.
  const isDesktop = useMediaQuery("(min-width: 640px)");

  const { data: categoryRows } = useQuery({
    ...queryKeys.categories.list(),
    queryFn: () => getCategoryList(),
  });
  // Memoized: this array is a prop of every visible row's category cell, so a
  // fresh one per render defeated the row memoization below.
  const categoryOptions = useMemo(
    () => categoryRows?.map((c) => c.name) ?? [],
    [categoryRows],
  );

  // Destructured to the stable member on purpose: react-query rebuilds its
  // useMutation result as a new object literal on every render, so depending on
  // the whole result below made every row handler fresh and defeated
  // React.memo(CatalogRow). mutateAsync is bound once per observer.
  const { mutateAsync: quickEditProduct } = useQuickEditProductMutation();
  const { mutateAsync: submitStockAudit } = useSubmitStockAuditMutation();

  const saveCategory = useCallback(
    async (product: Product, category: string) => {
      try {
        await quickEditProduct({ id: product.id, category });
        onProductUpdated();
      } catch {
        toast.error("Failed to update category. Please try again.");
      }
    },
    [quickEditProduct, onProductUpdated],
  );

  const saveSellingPrice = useCallback(
    async (product: Product, sellingPrice: number) => {
      try {
        await quickEditProduct({ id: product.id, sellingPrice });
        onProductUpdated();
      } catch {
        toast.error("Failed to update selling price. Please try again.");
      }
    },
    [quickEditProduct, onProductUpdated],
  );

  const saveReorderLevel = useCallback(
    async (product: Product, reorderLevel: number) => {
      try {
        await quickEditProduct({ id: product.id, reorderLevel });
        onProductUpdated();
      } catch {
        toast.error("Failed to update reorder level. Please try again.");
      }
    },
    [quickEditProduct, onProductUpdated],
  );

  const saveStockQuantity = useCallback(
    async (product: Product, stockQuantity: number) => {
      try {
        await submitStockAudit({
          items: [
            {
              productId: product.id,
              systemQty: product.stockQuantity,
              countedQty: stockQuantity,
              reason: "Quick edit from catalog",
            },
          ],
          performedBy: user?.id || null,
        });
        onProductUpdated();
      } catch {
        toast.error("Failed to update stock. Please try again.");
      }
    },
    [submitStockAudit, user?.id, onProductUpdated],
  );

  const scrollRef = useRef<HTMLDivElement>(null);
  // Row height differs between the stacked mobile layout and the desktop grid
  // row, so this measures actual rendered height per row instead of assuming
  // one fixed size.
  const rowVirtualizer = useVirtualizer({
    count: filteredProducts.length,
    getScrollElement: () => scrollRef.current,
    estimateSize: () => 72,
    overscan: 8,
  });

  return (
    <div className="flex flex-col h-full min-h-0">
      {isFuzzyFallback && filteredProducts.length > 0 && (
        <div className="bg-amber-500/10 text-amber-600 px-4 py-2 text-sm border-b border-amber-500/20 text-center font-medium">
          Did you mean? (No exact matches found. Showing closest names.)
        </div>
      )}

      {/* Header */}
      <div className={`hidden sm:grid gap-2 ${showCostColumn ? CATALOG_GRID_COLS.withCost : CATALOG_GRID_COLS.withoutCost} px-4 py-2.5 text-[11px] font-bold text-muted-foreground uppercase tracking-wide border-b border-border shrink-0`}>
        <SortableHeaderCell
          label="Product"
          active={sortKey === "name"}
          direction={sortDirection}
          onClick={() => onToggleSort("name")}
        />
        <SortableHeaderCell
          label="Category"
          active={sortKey === "category"}
          direction={sortDirection}
          onClick={() => onToggleSort("category")}
        />
        {showCostColumn && (
          <SortableHeaderCell
            label="Avg Cost"
            active={sortKey === "costPrice"}
            direction={sortDirection}
            onClick={() => onToggleSort("costPrice")}
          />
        )}
        <SortableHeaderCell
          label="S. Price"
          active={sortKey === "sellingPrice"}
          direction={sortDirection}
          onClick={() => onToggleSort("sellingPrice")}
        />
        <SortableHeaderCell
          label="Stock"
          active={sortKey === "stockQuantity"}
          direction={sortDirection}
          onClick={() => onToggleSort("stockQuantity")}
        />
        <SortableHeaderCell
          label="Reorder"
          active={sortKey === "reorderLevel"}
          direction={sortDirection}
          onClick={() => onToggleSort("reorderLevel")}
        />
      </div>

      {/* Rows */}
      <div
        ref={scrollRef}
        className="flex-1 overflow-y-auto py-3 sm:py-0 mb-4"
      >
        {isLoading && filteredProducts.length === 0 && <CatalogListSkeleton />}
        {!isLoading && loadFailed && (
          <EmptyState
            icon={AlertCircle}
            title="Couldn't load the catalog on this device"
            description="The product list couldn't be read from this device's local database. Nothing is lost — try again."
            action={onRetryLoad ? { label: "Retry", onClick: onRetryLoad } : undefined}
          />
        )}
        {!isLoading && !loadFailed && filteredProducts.length === 0 && (
          <EmptyCatalogList
            totalCount={totalCount}
            isAdmin={isAdmin}
            isAuditor={user?.role === "auditor"}
            onRequestProduct={() => setShowRequestDialog(true)}
          />
        )}
        {filteredProducts.length > 0 && (
          <div
            className="relative w-full"
            style={{ height: rowVirtualizer.getTotalSize() }}
          >
            {rowVirtualizer.getVirtualItems().map((virtualRow) => {
              const product = filteredProducts[virtualRow.index];
              return (
                <div
                  key={product.id}
                  data-index={virtualRow.index}
                  ref={rowVirtualizer.measureElement}
                  className="absolute top-0 left-0 w-full pb-2 sm:pb-0"
                  style={{ transform: `translateY(${virtualRow.start}px)` }}
                >
                  <CatalogRow
                    product={product}
                    isSelected={selectedProductId === product.id}
                    isDesktop={isDesktop}
                    isPharmacy={isPharmacy}
                    capsClass={capsClass}
                    categoryOptions={categoryOptions}
                    canEdit={canManageStockBatch}
                    showCostColumn={showCostColumn}
                    canEditSellingPrice={canEditSellingPrice}
                    canAdjustStockQuantity={canAdjustStockQuantity}
                    hasTouchCapability={hasTouchCapability}
                    formatCurrency={formatCurrency}
                    onSelect={onSelectProduct}
                    onSaveCategory={saveCategory}
                    onSaveSellingPrice={saveSellingPrice}
                    onSaveStockQuantity={saveStockQuantity}
                    onSaveReorderLevel={saveReorderLevel}
                  />
                </div>
              );
            })}
          </div>
        )}
      </div>
      <ScrollToTopButton scrollRef={scrollRef} />
      <RequestItemDialog
        open={showRequestDialog}
        onOpenChange={setShowRequestDialog}
      />
    </div>
  );
}
