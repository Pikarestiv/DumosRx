import React, { useRef, useState } from "react";
import { Package, ChevronRight, ClipboardList } from "lucide-react";
import { useVirtualizer } from "@tanstack/react-virtual";
import { useQuery } from "@tanstack/react-query";
import { toast } from "sonner";
import { Product } from "./types";
import { useStore } from "@/lib/context/store-context";
import { useAuth } from "@/lib/context/auth-context";
import { SortableHeaderCell } from "@/components/ui/sortable-header-cell";
import { EmptyState } from "@/components/ui/empty-state";
import { RequestItemDialog } from "@/components/pos/request-item-dialog";
import { EditableCategoryCell, EditableQuickNumberCell } from "./catalog-editable-cells";
import { useQuickEditProductMutation } from "@/lib/hooks/use-product-quick-edit-mutation";
import { useSubmitStockAuditMutation } from "@/lib/hooks/use-stock-audit-mutation";
import { useHasTouchCapability } from "@/lib/hooks/use-has-touch-capability";
import { getCategoryList } from "@/lib/db/queries/categories";
import { queryKeys } from "@/lib/query-keys";
import type { SortDirection } from "@/lib/hooks/use-sortable-data";

type ProductSortKey =
  | "name"
  | "category"
  | "costPrice"
  | "sellingPrice"
  | "stockQuantity"
  | "reorderLevel";

interface CatalogListProps {
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
  const [showRequestDialog, setShowRequestDialog] = useState(false);
  // A 2-in-1 laptop's trackpad still lets it hover, but a user tapping its
  // touchscreen directly never fires :hover — so the edit pencil must stay
  // visible whenever touch is available at all, not just on touch-primary
  // devices (see useHasTouchCapability's doc comment for the distinction).
  const hasTouchCapability = useHasTouchCapability();

  const { data: categoryRows } = useQuery({
    ...queryKeys.categories.list(),
    queryFn: () => getCategoryList(),
  });
  const categoryOptions = categoryRows?.map((c) => c.name) ?? [];

  const quickEditMutation = useQuickEditProductMutation();
  const stockAuditMutation = useSubmitStockAuditMutation();

  const saveCategory = async (product: Product, category: string) => {
    try {
      await quickEditMutation.mutateAsync({ id: product.id, category });
      onProductUpdated();
    } catch {
      toast.error("Failed to update category. Please try again.");
    }
  };

  const saveSellingPrice = async (product: Product, sellingPrice: number) => {
    try {
      await quickEditMutation.mutateAsync({ id: product.id, sellingPrice });
      onProductUpdated();
    } catch {
      toast.error("Failed to update selling price. Please try again.");
    }
  };

  const saveReorderLevel = async (product: Product, reorderLevel: number) => {
    try {
      await quickEditMutation.mutateAsync({ id: product.id, reorderLevel });
      onProductUpdated();
    } catch {
      toast.error("Failed to update reorder level. Please try again.");
    }
  };

  const saveStockQuantity = async (product: Product, stockQuantity: number) => {
    try {
      await stockAuditMutation.mutateAsync({
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
  };

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
      <div className="hidden sm:grid grid-cols-[1fr_110px_90px_90px_100px_90px] gap-2 px-4 py-2.5 text-[11px] font-bold text-muted-foreground uppercase tracking-wide border-b border-border shrink-0">
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
        <SortableHeaderCell
          label="Avg Cost"
          active={sortKey === "costPrice"}
          direction={sortDirection}
          onClick={() => onToggleSort("costPrice")}
        />
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
        className="flex-1 overflow-y-auto hide-scrollbar py-3 sm:py-0"
      >
        {filteredProducts.length === 0 && (
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
            const isSelected = selectedProductId === product.id;
            return (
              <div
                key={product.id}
                data-index={virtualRow.index}
                ref={rowVirtualizer.measureElement}
                className="absolute top-0 left-0 w-full pb-2 sm:pb-0"
                style={{ transform: `translateY(${virtualRow.start}px)` }}
              >
              <div
                onClick={() => onSelectProduct(product)}
                className={`group px-4 py-3 sm:py-2 rounded-xl sm:rounded-none border sm:border-t-0 sm:border-r-0 sm:border-b border-border cursor-pointer transition-colors ${
                  isSelected
                    ? "bg-primary/5 border-l-2 border-l-primary"
                    : "bg-card sm:bg-transparent hover:bg-muted/50 border-l-2 border-l-transparent"
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
                <div className="hidden sm:grid grid-cols-[1fr_110px_90px_90px_100px_90px] gap-2 items-center">
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
                  <EditableCategoryCell
                    product={product}
                    categoryOptions={categoryOptions}
                    canEdit={canManageStockBatch}
                    hasTouchCapability={hasTouchCapability}
                    onSave={saveCategory}
                  />
                  <div className="text-[13px] font-medium text-muted-foreground">
                    {product.costPrice > 0 ? formatCurrency(product.costPrice) : "-"}
                  </div>
                  <EditableQuickNumberCell
                    displayValue={formatCurrency(product.sellingPrice)}
                    value={product.sellingPrice}
                    parse={parseFloat}
                    step="0.01"
                    widthClassName="w-20"
                    canEdit={canManageStockBatch}
                    hasTouchCapability={hasTouchCapability}
                    onSave={(val) => saveSellingPrice(product, val)}
                  />
                  <EditableQuickNumberCell
                    displayValue={`${product.stockQuantity} ${product.baseUnit || "unit"}${product.stockQuantity === 1 ? "" : "s"}`}
                    displayClassName={`text-[13px] font-semibold ${product.stockQuantity <= product.reorderLevel ? "text-destructive" : "text-primary"}`}
                    value={product.stockQuantity}
                    parse={(raw) => parseInt(raw, 10)}
                    canEdit={canManageStockBatch}
                    hasTouchCapability={hasTouchCapability}
                    onSave={(val) => saveStockQuantity(product, val)}
                  />
                  <EditableQuickNumberCell
                    displayValue={String(product.reorderLevel)}
                    displayClassName="text-[13px] text-muted-foreground"
                    value={product.reorderLevel}
                    parse={(raw) => parseInt(raw, 10)}
                    canEdit={canManageStockBatch}
                    hasTouchCapability={hasTouchCapability}
                    onSave={(val) => saveReorderLevel(product, val)}
                  />
                </div>
              </div>
              </div>
            );
            })}
          </div>
        )}
      </div>
      <RequestItemDialog
        open={showRequestDialog}
        onOpenChange={setShowRequestDialog}
      />
    </div>
  );
}

function EmptyCatalogList({
  totalCount,
  isAdmin,
  isAuditor,
  onRequestProduct,
}: {
  totalCount: number;
  isAdmin: boolean;
  isAuditor: boolean;
  onRequestProduct: () => void;
}) {
  if (totalCount > 0) {
    return (
      <EmptyState
        icon={Package}
        title="No products found"
        description="Try adjusting your search or filters"
      />
    );
  }

  return (
    <EmptyState
      icon={Package}
      title="No products found"
      description="Get started by adding products to your catalog."
      action={
        isAdmin
          ? {
              label: "Create Purchase Order",
              href: "/procurement/new",
              icon: ClipboardList,
            }
          : isAuditor
            ? undefined
            : { label: "Request Product", onClick: onRequestProduct }
      }
    />
  );
}

