import { ProductSearchBar } from "./product-search-bar";
import { ProductCategoryChips } from "./product-category-chips";
import { cn } from "@/lib/utils";

interface ProductDatabaseFiltersProps {
  searchTerm: string;
  setSearchTerm: (val: string) => void;
  categoryFilter: string;
  setCategoryFilter: (val: string) => void;
  statusFilter: string;
  setStatusFilter: (val: string) => void;
  categories: string[];
  statuses: string[];
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
}: ProductDatabaseFiltersProps) {
  // Search bar + chips render standalone above the card on mobile (see ProductDatabase) —
  // this whole panel is desktop-only to avoid leaving an empty padded/bordered row on mobile.
  return (
    <div className="hidden lg:block p-4 border-b border-border space-y-4">
      <ProductSearchBar
        searchTerm={searchTerm}
        setSearchTerm={setSearchTerm}
        statusFilter={statusFilter}
        setStatusFilter={setStatusFilter}
        statuses={statuses}
      />
      <ProductCategoryChips
        categoryFilter={categoryFilter}
        setCategoryFilter={setCategoryFilter}
        categories={categories}
        triggerClassName={cn(
          // active
          "data-[state=active]:bg-primary data-[state=active]:text-primary-foreground data-[state=active]:shadow-none",
          // inactive
          "data-[state=inactive]:border-border data-[state=inactive]:bg-transparent data-[state=inactive]:text-muted-foreground",
          // inactive + hover
          "data-[state=inactive]:hover:bg-primary/10 data-[state=inactive]:hover:text-primary data-[state=inactive]:hover:border-primary/50",
        )}
      />
    </div>
  );
}
