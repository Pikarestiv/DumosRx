import React from "react";
import { Barcode, ChevronRight, Eye, Trash2 } from "lucide-react";
import { Product } from "./types";
import {
  ContextMenu,
  ContextMenuContent,
  ContextMenuItem,
  ContextMenuTrigger,
} from "@/components/ui/context-menu";
import {
  EditableCategoryCell,
  EditableQuickNumberCell,
} from "./catalog-editable-cells";

const NO_LABEL_PERMISSION =
  "You don't have permission to print product labels. Ask an admin for the “Print Product Labels” permission.";
const NO_DELETE_PERMISSION =
  "You don't have permission to delete products. Ask an admin for the “Delete Products” permission.";

/** Literal class strings, not a template: Tailwind's scanner only sees
 * classes that appear whole in the source. Indexed by whether the Avg Cost
 * column is rendered, which now varies with "view_cost_fields". */
export const CATALOG_GRID_COLS = {
  withCost: "grid-cols-[1fr_150px_90px_90px_100px_90px]",
  withoutCost: "grid-cols-[1fr_150px_90px_100px_90px]",
} as const;

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
  showCostColumn: boolean;
  canEditSellingPrice: boolean;
  canAdjustStockQuantity: boolean;
  hasTouchCapability: boolean;
  canPrintLabels: boolean;
  canDeleteProducts: boolean;
  formatCurrency: (amount: number) => string;
  onSelect: (product: Product) => void;
  onSaveCategory: (product: Product, category: string) => void;
  onSaveSellingPrice: (product: Product, sellingPrice: number) => void;
  onSaveStockQuantity: (product: Product, stockQuantity: number) => void;
  onSaveReorderLevel: (product: Product, reorderLevel: number) => void;
  onPrintLabel: (product: Product) => void;
  onDeleteProduct: (product: Product) => void;
}

function CatalogRowInner({
  product,
  isSelected,
  isDesktop,
  isPharmacy,
  capsClass,
  categoryOptions,
  canEdit,
  showCostColumn,
  canEditSellingPrice,
  canAdjustStockQuantity,
  hasTouchCapability,
  canPrintLabels,
  canDeleteProducts,
  formatCurrency,
  onSelect,
  onSaveCategory,
  onSaveSellingPrice,
  onSaveStockQuantity,
  onSaveReorderLevel,
  onPrintLabel,
  onDeleteProduct,
}: CatalogRowProps) {
  const row = (
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
          className={`grid gap-2 items-center ${showCostColumn ? CATALOG_GRID_COLS.withCost : CATALOG_GRID_COLS.withoutCost}`}
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
          {showCostColumn && (
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
          )}
          <EditableQuickNumberCell
            displayValue={formatCurrency(product.sellingPrice)}
            value={product.sellingPrice}
            parse={parseFloat}
            step="0.01"
            widthClassName="w-20"
            canEdit={canEdit && canEditSellingPrice}
            hasTouchCapability={hasTouchCapability}
            ariaLabel={`Edit selling price for ${product.name} (${formatCurrency(product.sellingPrice)})`}
            onSave={(val) => onSaveSellingPrice(product, val)}
          />
          <EditableQuickNumberCell
            displayValue={`${product.stockQuantity} ${product.baseUnit || "unit"}${product.stockQuantity === 1 ? "" : "s"}`}
            displayClassName={`text-[13px] font-semibold ${product.stockQuantity <= product.reorderLevel ? "text-destructive" : "text-primary"}`}
            value={product.stockQuantity}
            parse={(raw) => parseInt(raw, 10)}
            canEdit={canEdit && canAdjustStockQuantity}
            hasTouchCapability={hasTouchCapability}
            ariaLabel={`Edit stock quantity for ${product.name} (${product.stockQuantity})`}
            commitOnBlur={false}
            onSave={(val) => onSaveStockQuantity(product, val)}
          />
          <EditableQuickNumberCell
            displayValue={String(product.reorderLevel)}
            displayClassName="text-[13px] text-muted-foreground"
            value={product.reorderLevel}
            parse={(raw) => parseInt(raw, 10)}
            canEdit={canEdit}
            hasTouchCapability={hasTouchCapability}
            ariaLabel={`Edit reorder level for ${product.name} (${product.reorderLevel})`}
            onSave={(val) => onSaveReorderLevel(product, val)}
          />
        </div>
      )}
    </div>
  );

  return (
    <ContextMenu>
      <ContextMenuTrigger asChild>{row}</ContextMenuTrigger>
      <ContextMenuContent className="w-56">
        <ContextMenuItem onSelect={() => onSelect(product)}>
          <Eye className="w-4 h-4 mr-2" />
          View details
        </ContextMenuItem>
        <ContextMenuItem
          disabled={!canPrintLabels}
          title={canPrintLabels ? undefined : NO_LABEL_PERMISSION}
          onSelect={() => onPrintLabel(product)}
        >
          <Barcode className="w-4 h-4 mr-2" />
          Print barcode label
        </ContextMenuItem>
        <ContextMenuItem
          variant="destructive"
          disabled={!canDeleteProducts}
          title={canDeleteProducts ? undefined : NO_DELETE_PERMISSION}
          onSelect={() => onDeleteProduct(product)}
        >
          <Trash2 className="w-4 h-4 mr-2" />
          Delete product
        </ContextMenuItem>
      </ContextMenuContent>
    </ContextMenu>
  );
}

/** Memoized: without this every visible row re-rendered on any parent render
 * (a keystroke in the filter bar, a sort toggle, a mutation settling), which
 * with the editable cells inside it is the expensive part of this screen. */
export const CatalogRow = React.memo(CatalogRowInner);
