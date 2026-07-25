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

interface ProductSearchBarProps {
  searchTerm: string;
  setSearchTerm: (val: string) => void;
  statusFilter: string;
  setStatusFilter: (val: string) => void;
  statuses: string[];
  inputClassName?: string;
  buttonClassName?: string;
}

/** Search input + status-filter button, shared between the desktop in-card filters bar and the standalone mobile search row. */
export function ProductSearchBar({
  searchTerm,
  setSearchTerm,
  statusFilter,
  setStatusFilter,
  statuses,
  inputClassName = "bg-muted border-transparent",
  buttonClassName = "bg-primary/5 border-transparent",
}: ProductSearchBarProps) {
  return (
    <div className="flex gap-2">
      <div className="relative flex-1">
        <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-muted-foreground pointer-events-none" />
        <Input
          placeholder="Search by name or SKU"
          value={searchTerm}
          onChange={(e) => setSearchTerm(e.target.value)}
          className={`pl-9 focus-visible:ring-1 focus-visible:ring-ring rounded-lg ${inputClassName}`}
        />
      </div>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button
            variant="outline"
            size="icon"
            className={`shrink-0 rounded-lg ${buttonClassName}`}
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
  );
}
