import { useId } from "react";
import { Search } from "lucide-react";
import { Input } from "@/components/ui/input";

interface SearchInputProps {
  value: string;
  onChange: (val: string) => void;
  placeholder?: string;
  inputClassName?: string;
  // Accessible name for the input.
  // Rationale: docs/CLIENT_COMMENTS.md#block-components-ui-search-input-tsx-L10
  "aria-label"?: string;
}

/** Search input with a leading icon, shared across list pages (product catalog, activity log, ...). */
export function SearchInput({
  value,
  onChange,
  placeholder = "Search...",
  inputClassName = "bg-muted border-transparent",
  "aria-label": ariaLabel,
}: SearchInputProps) {
  const inputId = useId();
  return (
    <div className="relative flex-1">
      <label
        htmlFor={inputId}
        className="absolute left-3 top-1/2 -translate-y-1/2 cursor-text"
      >
        <Search className="h-4 w-4 text-muted-foreground" />
      </label>
      <Input
        id={inputId}
        aria-label={ariaLabel || placeholder}
        placeholder={placeholder}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className={`pl-9 focus-visible:ring-1 focus-visible:ring-ring rounded-lg ${inputClassName}`}
      />
    </div>
  );
}
