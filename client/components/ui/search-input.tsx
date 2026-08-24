import { Search } from "lucide-react";
import { Input } from "@/components/ui/input";

interface SearchInputProps {
  value: string;
  onChange: (val: string) => void;
  placeholder?: string;
  inputClassName?: string;
}

/** Search input with a leading icon, shared across list pages (product catalog, activity log, ...). */
export function SearchInput({
  value,
  onChange,
  placeholder = "Search...",
  inputClassName = "bg-muted border-transparent",
}: SearchInputProps) {
  return (
    <div className="relative flex-1">
      <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-muted-foreground pointer-events-none" />
      <Input
        placeholder={placeholder}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className={`pl-9 focus-visible:ring-1 focus-visible:ring-ring rounded-lg ${inputClassName}`}
      />
    </div>
  );
}
