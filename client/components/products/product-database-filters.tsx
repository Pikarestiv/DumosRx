import { Settings2 } from "lucide-react";
import { ProductSearchBar } from "./product-search-bar";
import { ProductFilterPill, formatFilterLabel } from "./product-filter-pill";
import { Button } from "@/components/ui/button";

interface ProductDatabaseFiltersProps {
  searchTerm: string;
  setSearchTerm: (val: string) => void;
  categoryFilter: string;
  setCategoryFilter: (val: string) => void;
  statusFilter: string;
  setStatusFilter: (val: string) => void;
  categories: string[];
  statuses: string[];
  onManageCategories: () => void;
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
  onManageCategories,
}: ProductDatabaseFiltersProps) {
  // Search bar + filter pills render standalone above the card on mobile (see ProductDatabase) —
  // this whole panel is desktop-only to avoid leaving an empty padded/bordered row on mobile.
  return (
    <div className="hidden lg:block p-4 border-b border-border space-y-3">
      <div className="flex items-center gap-2">
        <ProductSearchBar searchTerm={searchTerm} setSearchTerm={setSearchTerm} />
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
      </div>
      <div className="flex items-center gap-2 flex-wrap">
        <ProductFilterPill
          label="Category"
          value={categoryFilter}
          onValueChange={setCategoryFilter}
          options={categories.map((c) => ({
            value: c,
            label: c === "all" ? "All" : c,
          }))}
        />
        <ProductFilterPill
          label="Inventory"
          value={statusFilter}
          onValueChange={setStatusFilter}
          options={statuses.map((s) => ({
            value: s,
            label: formatFilterLabel(s),
          }))}
        />
      </div>
    </div>
  );
}
