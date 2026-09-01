import React, { useRef, useState } from "react";
import { Package, ChevronRight, Pencil, Check, X } from "lucide-react";
import { useVirtualizer } from "@tanstack/react-virtual";
import { toast } from "sonner";
import { Product } from "./types";
import { useStore } from "@/lib/context/store-context";
import { useAuth } from "@/lib/context/auth-context";
import { SortableHeaderCell } from "@/components/ui/sortable-header-cell";
import { EditableNumberCell } from "@/components/ui/editable-number-cell";
import { useQuickEditProductMutation } from "@/lib/hooks/use-product-quick-edit-mutation";
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
  const { canManageStockBatch } = useAuth();

  const [editingId, setEditingId] = useState<string | null>(null);
  const [draft, setDraft] = useState<{
    sellingPrice: number;
    reorderLevel: number;
  } | null>(null);

  const startQuickEdit = (product: Product) => {
    if (!canManageStockBatch) return;
    setEditingId(product.id);
    setDraft({
      sellingPrice: product.sellingPrice,
      reorderLevel: product.reorderLevel,
    });
  };

  const cancelQuickEdit = () => {
    setEditingId(null);
    setDraft(null);
  };

  const quickEditMutation = useQuickEditProductMutation();

  const saveQuickEdit = (product: Product) => {
    if (!draft || quickEditMutation.isPending) return;
    quickEditMutation.mutate(
      { id: product.id, sellingPrice: draft.sellingPrice, reorderLevel: draft.reorderLevel },
      {
        onSuccess: () => {
          toast.success(`${product.name} updated`);
          onProductUpdated();
        },
        onError: () => {
          toast.error("Failed to update product. Please try again.");
        },
        onSettled: () => {
          setEditingId(null);
          setDraft(null);
        },
      },
    );
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
      <div className="hidden sm:grid grid-cols-[1fr_110px_90px_90px_100px_90px_28px] gap-2 px-4 py-2.5 text-[11px] font-bold text-muted-foreground uppercase tracking-wide border-b border-border shrink-0">
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
        <div />
      </div>

      {/* Rows */}
      <div
        ref={scrollRef}
        className="flex-1 overflow-y-auto hide-scrollbar py-3 sm:py-0"
      >
        {filteredProducts.length === 0 && (
          <EmptyCatalogList totalCount={totalCount} />
        )}
        {filteredProducts.length > 0 && (
          <div
            className="relative w-full"
            style={{ height: rowVirtualizer.getTotalSize() }}
          >
            {rowVirtualizer.getVirtualItems().map((virtualRow) => {
            const product = filteredProducts[virtualRow.index];
            const isSelected = selectedProductId === product.id;
            const isEditingRow = editingId === product.id;
            return (
              <div
                key={product.id}
                data-index={virtualRow.index}
                ref={rowVirtualizer.measureElement}
                className="absolute top-0 left-0 w-full pb-2 sm:pb-0"
                style={{ transform: `translateY(${virtualRow.start}px)` }}
              >
              <div
                onClick={() => {
                  if (!isEditingRow) onSelectProduct(product);
                }}
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
                <div className="hidden sm:grid grid-cols-[1fr_110px_90px_90px_100px_90px_28px] gap-2 items-center">
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
                  <div className="text-[13px] font-medium text-muted-foreground">
                    {product.costPrice > 0 ? formatCurrency(product.costPrice) : "-"}
                  </div>
                  {isEditingRow && draft ? (
                    <div onClick={(e) => e.stopPropagation()}>
                      <EditableNumberCell
                        value={draft.sellingPrice}
                        onCommit={(val) =>
                          setDraft((d) => (d ? { ...d, sellingPrice: val } : d))
                        }
                        parse={parseFloat}
                        step="0.01"
                        widthClassName="w-20"
                        autoFocus
                      />
                    </div>
                  ) : (
                    <div className="text-[13px] font-semibold">
                      {formatCurrency(product.sellingPrice)}
                    </div>
                  )}
                  <div
                    className={`text-[13px] font-semibold ${product.stockQuantity <= product.reorderLevel ? "text-destructive" : "text-primary"}`}
                  >
                    {product.stockQuantity} {product.baseUnit || "unit"}
                    {product.stockQuantity === 1 ? "" : "s"}
                  </div>
                  {isEditingRow && draft ? (
                    <div onClick={(e) => e.stopPropagation()}>
                      <EditableNumberCell
                        value={draft.reorderLevel}
                        onCommit={(val) =>
                          setDraft((d) => (d ? { ...d, reorderLevel: val } : d))
                        }
                        parse={(raw) => parseInt(raw, 10)}
                        widthClassName="w-16"
                      />
                    </div>
                  ) : (
                    <div className="text-[13px] text-muted-foreground">
                      {product.reorderLevel}
                    </div>
                  )}
                  {isEditingRow ? (
                    <div
                      className="flex items-center gap-1"
                      onClick={(e) => e.stopPropagation()}
                    >
                      <button
                        type="button"
                        onClick={() => saveQuickEdit(product)}
                        className="p-1 rounded text-emerald-600 hover:bg-emerald-500/10"
                        title="Save"
                      >
                        <Check className="w-3.5 h-3.5" />
                      </button>
                      <button
                        type="button"
                        onClick={cancelQuickEdit}
                        className="p-1 rounded text-muted-foreground hover:bg-muted"
                        title="Cancel"
                      >
                        <X className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  ) : (
                    canManageStockBatch && (
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          startQuickEdit(product);
                        }}
                        className="p-1 rounded text-muted-foreground opacity-0 group-hover:opacity-100 hover:bg-muted hover:text-foreground transition-opacity"
                        title="Quick edit"
                      >
                        <Pencil className="w-3.5 h-3.5" />
                      </button>
                    )
                  )}
                </div>
              </div>
              </div>
            );
            })}
          </div>
        )}
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
