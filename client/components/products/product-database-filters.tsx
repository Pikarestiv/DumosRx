import { SearchInput } from "@/components/ui/search-input";
import { FilterPill, formatFilterLabel } from "@/components/ui/filter-pill";
import { ProductActionsMenu } from "./product-actions-menu";
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
        <ProductActionsMenu
          onManageCategories={onManageCategories}
          onProductsChanged={onProductsChanged}
          filteredProductIds={filteredProductIds}
          labelProducts={labelProducts}
        />
      </div>
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
