import { useState } from "react";
import { Barcode, Settings2 } from "lucide-react";
import { SearchInput } from "@/components/ui/search-input";
import { FilterPill, formatFilterLabel } from "@/components/ui/filter-pill";
import { Button } from "@/components/ui/button";
import { ImportExportToolbar } from "@/components/stock-batch/import-export-toolbar";
import { BulkShowOnlineAction } from "./bulk-show-online-action";
import { useAuth } from "@/lib/context/auth-context";
import { useStore } from "@/lib/context/store-context";
import { useHasPermission } from "@/lib/hooks/use-permissions";
import { BarcodeBulkPrintDialog } from "@/components/stock-batch/barcode-bulk-print-dialog";
import type { Product } from "./types";

interface ProductDatabaseFiltersProps {
  searchTerm: string;
  setSearchTerm: (val: string) => void;
  categoryFilter: string;
  setCategoryFilter: (val: string) => void;
  statusFilter: string;
  setStatusFilter: (val: string) => void;
  categories: string[];
  statuses: string[];
  owedCount?: number;
  onManageCategories: () => void;
  onProductsChanged: () => void;
  // Currently-filtered product ids, so Export and the bulk online-visibility action both default to what's on screen — undef…
  // Rationale: docs/CLIENT_COMMENTS.md#block-components-products-product-database-filters-tsx-L21
  filteredProductIds?: string[];
  labelProducts?: Product[];
}

export function ProductDatabaseFilters({
  searchTerm,
  setSearchTerm,
  categoryFilter,
  setCategoryFilter,
  statusFilter,
  setStatusFilter,
  categories,
  statuses,
  owedCount = 0,
  onManageCategories,
  onProductsChanged,
  filteredProductIds,
  labelProducts,
}: ProductDatabaseFiltersProps) {
  const { canManageStockBatch } = useAuth();
  const { storeProfile } = useStore();
  const canPrintLabels = useHasPermission("print_product_labels");
  const [showLabels, setShowLabels] = useState(false);
  // Only meaningful once the store actually has a public storefront - hidden
  // otherwise rather than offering an action with nowhere to publish to.
  const hasOnlineStore = storeProfile?.online_store_enabled === 1;
  // Search bar + filter pills render standalone above the card on mobile (see ProductDatabase).
  // This whole panel is desktop-only to avoid leaving an empty padded/bordered row on mobile.
  return (
    <div className="hidden lg:block p-4 border-b border-border space-y-3">
      <div className="flex items-center gap-2">
        <SearchInput
          value={searchTerm}
          onChange={setSearchTerm}
          placeholder="Search by name or SKU"
          aria-label="Search products"
        />
        {canPrintLabels && labelProducts && (
          <Button
            type="button"
            variant="outline"
            size="sm"
            className="shrink-0 gap-1.5 text-[12px]"
            onClick={() => setShowLabels(true)}
          >
            <Barcode className="h-3.5 w-3.5" />
            Print labels
          </Button>
        )}
        {canManageStockBatch && (
          <>
            <ImportExportToolbar onImported={onProductsChanged} filteredProductIds={filteredProductIds} />
            {hasOnlineStore && (
              <BulkShowOnlineAction
                onUpdated={onProductsChanged}
                filteredProductIds={filteredProductIds}
              />
            )}
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="shrink-0 gap-1.5 text-[12px]"
              onClick={onManageCategories}
            >
              <Settings2 className="h-3.5 w-3.5" />
              Manage
            </Button>
          </>
        )}
      </div>
      {showLabels && labelProducts && (
        <BarcodeBulkPrintDialog
          isOpen
          onClose={() => setShowLabels(false)}
          products={labelProducts.map((p) => ({
            id: p.id,
            name: p.name,
            barcode: p.barcode,
            unit_price: p.sellingPrice,
          }))}
        />
      )}
      <div className="flex items-center gap-2 flex-wrap">
        <FilterPill
          label="Category"
          value={categoryFilter}
          onValueChange={setCategoryFilter}
          options={categories.map((c) => ({
            value: c,
            label: c === "all" ? "All" : c,
          }))}
        />
        <FilterPill
          label="Inventory"
          value={statusFilter}
          onValueChange={setStatusFilter}
          options={statuses.map((s) => ({
            value: s,
            label: s === "stock_owed" ? `Stock Owed (${owedCount})` : formatFilterLabel(s),
          }))}
        />
      </div>
    </div>
  );
}
