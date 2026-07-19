import { Search, Filter } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { useStore } from "@/lib/context/store-context";

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
  const { t } = useStore();

  return (
    <div className="p-4 border-b border-border space-y-4">
      <div className="flex gap-2">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-muted-foreground pointer-events-none" />
          <Input
            placeholder={`Search by name or SKU`}
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="pl-9 bg-primary/5 border-transparent focus-visible:ring-1 focus-visible:ring-ring rounded-lg"
          />
        </div>
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button
              variant="outline"
              size="icon"
              className="shrink-0 bg-primary/5 border-transparent rounded-lg"
            >
              <Filter className="h-4 w-4" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-[200px]">
            <DropdownMenuRadioGroup
              value={statusFilter}
              onValueChange={setStatusFilter}
            >
              {statuses.map((s) => (
                <DropdownMenuRadioItem key={s} value={s}>
                  {s === "all"
                    ? "All Status"
                    : s
                        .replace("_", " ")
                        .split(" ")
                        .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
                        .join(" ")}
                </DropdownMenuRadioItem>
              ))}
            </DropdownMenuRadioGroup>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
      <div className="flex overflow-x-auto hide-scrollbar gap-2 pb-1">
        <button
          className={`shrink-0 px-4 py-1.5 rounded-full text-sm font-medium transition-colors ${categoryFilter === "all" ? "bg-primary text-primary-foreground" : "bg-transparent border border-border text-foreground hover:bg-muted/50"}`}
          onClick={() => setCategoryFilter("all")}
        >
          All
        </button>
        {categories
          .filter((c) => c !== "all")
          .map((c) => (
            <button
              key={c}
              className={`shrink-0 px-4 py-1.5 rounded-full text-sm font-medium transition-colors ${categoryFilter === c ? "bg-primary text-primary-foreground" : "bg-transparent border border-border text-foreground hover:bg-muted/50"}`}
              onClick={() => setCategoryFilter(c)}
            >
              {c}
            </button>
          ))}
      </div>
    </div>
  );
}
