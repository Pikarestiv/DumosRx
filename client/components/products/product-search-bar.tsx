import { Search } from "lucide-react";
import { Input } from "@/components/ui/input";

interface ProductSearchBarProps {
  searchTerm: string;
  setSearchTerm: (val: string) => void;
  inputClassName?: string;
}

/** Search input, shared between the desktop in-card filters bar and the standalone mobile search row. */
export function ProductSearchBar({
  searchTerm,
  setSearchTerm,
  inputClassName = "bg-muted border-transparent",
}: ProductSearchBarProps) {
  return (
    <div className="relative flex-1">
      <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-muted-foreground pointer-events-none" />
      <Input
        placeholder="Search by name or SKU"
        value={searchTerm}
        onChange={(e) => setSearchTerm(e.target.value)}
        className={`pl-9 focus-visible:ring-1 focus-visible:ring-ring rounded-lg ${inputClassName}`}
      />
    </div>
  );
}
