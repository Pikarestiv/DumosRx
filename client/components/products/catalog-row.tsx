import React from "react";
import { ChevronRight } from "lucide-react";
import { Product } from "./types";
import {
  EditableCategoryCell,
  EditableQuickNumberCell,
} from "./catalog-editable-cells";

export interface CatalogRowProps {
  product: Product;
  isSelected: boolean;
  /** Which of the two layouts to mount. Deliberately a real conditional
   * rather than `sm:hidden`/`hidden sm:grid`: CSS-hiding the inactive branch
   * still mounted it, so every visible row carried a second copy of itself
   * including four stateful editable cells that were never on screen. */
  isDesktop: boolean;
  isPharmacy: boolean;
  capsClass: string;
  categoryOptions: string[];
  canEdit: boolean;
  hasTouchCapability: boolean;
  formatCurrency: (amount: number) => string;
  onSelect: (product: Product) => void;
  onSaveCategory: (product: Product, category: string) => void;
  onSaveSellingPrice: (product: Product, sellingPrice: number) => void;
  onSaveStockQuantity: (product: Product, stockQuantity: number) => void;
  onSaveReorderLevel: (product: Product, reorderLevel: number) => void;
}

function CatalogRowInner({
  product,
  isSelected,
  isDesktop,
  isPharmacy,
  capsClass,
  categoryOptions,
  canEdit,
  hasTouchCapability,
  formatCurrency,
  onSelect,
  onSaveCategory,
  onSaveSellingPrice,
  onSaveStockQuantity,
  onSaveReorderLevel,
}: CatalogRowProps) {
  return (
    <div
      role="button"
      tabIndex={0}
      onClick={() => onSelect(product)}
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          onSelect(product);
        }
      }}
      className={`group px-4 py-3 sm:py-2 rounded-xl sm:rounded-none border sm:border-t-0 sm:border-r-0 sm:border-b border-border cursor-pointer outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-inset transition-colors ${
        isSelected
          ? "bg-primary/5 border-l-2 border-l-primary"
          : "bg-card sm:bg-transparent hover:bg-muted/50 border-l-2 border-l-transparent"
      }`}
    >
      {!isDesktop && (
        <div
          data-catalog-row-mobile
          className="flex items-center justify-between"
        >
          <div className="min-w-0 pr-2 flex-1">
            <div className="text-[15px] font-bold text-foreground truncate flex items-center gap-2">
              <span className={capsClass}>{product.name}</span>
              {isPharmacy && !product.genericName && (
                <span
                  className="text-[10px] font-medium bg-amber-500/10 text-amber-600 px-1.5 py-0.5 rounded border border-amber-500/20"
                  title="Missing Generic Name"
                >
                  No Generic
                </span>
              )}
            </div>
            <div className="text-[13px] text-muted-foreground mt-0.5 truncate flex">
              {product.barcode || product.id.slice(0, 8)} ·{" "}
              <span className={capsClass}>
                {product.category || "Uncategorized"}
              </span>
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
      )}

      {isDesktop && (
        <div
          data-catalog-row-desktop
          className="grid grid-cols-[1fr_150px_90px_90px_100px_90px] gap-2 items-center"
        >
          <div className="min-w-0 pr-2">
            <div className="text-[13px] font-semibold truncate flex items-center gap-2">
              <span className={capsClass}>{product.name}</span>
              {isPharmacy && !product.genericName && (
                <span
                  className="text-[9px] font-medium bg-amber-500/10 text-amber-600 px-1.5 py-0.5 rounded border border-amber-500/20"
                  title="Missing Generic Name"
                >
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
            canEdit={canEdit}
            hasTouchCapability={hasTouchCapability}
            onSave={onSaveCategory}
          />
          <div className="text-[13px] font-medium text-muted-foreground">
            {product.costPrice > 0 ? formatCurrency(product.costPrice) : "-"}
            {product.lastBoughtPrice != null && (
              <div
                className="text-[10px] font-normal text-muted-foreground/60"
                title="Cost of the most recently received stock batch"
              >
                Last: {formatCurrency(product.lastBoughtPrice)}
              </div>
            )}
          </div>
          <EditableQuickNumberCell
            displayValue={formatCurrency(product.sellingPrice)}
            value={product.sellingPrice}
            parse={parseFloat}
            step="0.01"
            widthClassName="w-20"
            canEdit={canEdit}
            hasTouchCapability={hasTouchCapability}
            onSave={(val) => onSaveSellingPrice(product, val)}
          />
          <EditableQuickNumberCell
            displayValue={`${product.stockQuantity} ${product.baseUnit || "unit"}${product.stockQuantity === 1 ? "" : "s"}`}
            displayClassName={`text-[13px] font-semibold ${product.stockQuantity <= product.reorderLevel ? "text-destructive" : "text-primary"}`}
            value={product.stockQuantity}
            parse={(raw) => parseInt(raw, 10)}
            canEdit={canEdit}
            hasTouchCapability={hasTouchCapability}
            onSave={(val) => onSaveStockQuantity(product, val)}
          />
          <EditableQuickNumberCell
            displayValue={String(product.reorderLevel)}
            displayClassName="text-[13px] text-muted-foreground"
            value={product.reorderLevel}
            parse={(raw) => parseInt(raw, 10)}
            canEdit={canEdit}
            hasTouchCapability={hasTouchCapability}
            onSave={(val) => onSaveReorderLevel(product, val)}
          />
        </div>
      )}
    </div>
  );
}

/** Memoized: without this every visible row re-rendered on any parent render
 * (a keystroke in the filter bar, a sort toggle, a mutation settling), which
 * with the editable cells inside it is the expensive part of this screen. */
export const CatalogRow = React.memo(CatalogRowInner);
