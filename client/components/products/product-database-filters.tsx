import { Settings2 } from "lucide-react";
import { ProductSearchBar } from "./product-search-bar";
import { ProductCategoryChips } from "./product-category-chips";
import { Button } from "@/components/ui/button";
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
      <div className="flex items-center justify-between gap-3">
        <ProductCategoryChips
          categoryFilter={categoryFilter}
          setCategoryFilter={setCategoryFilter}
          categories={categories}
          triggerClassName={cn(
            // active
            "data-[state=active]:bg-primary data-[state=active]:text-primary-foreground data-[state=active]:shadow-none",
            // inactive (hover comes from the shared chips variant)
            "data-[state=inactive]:border-border data-[state=inactive]:bg-transparent data-[state=inactive]:text-muted-foreground",
          )}
        />
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
    </div>
  );
}
