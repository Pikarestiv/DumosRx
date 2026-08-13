import { ChevronDown, X } from "lucide-react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { cn } from "@/lib/utils";

export interface FilterPillOption {
  value: string;
  label: string;
}

interface FilterPillProps {
  label: string;
  value: string;
  onValueChange: (val: string) => void;
  options: FilterPillOption[];
  allValue?: string;
  className?: string;
}

/** Bunched-up "Label: value" dropdown filter — replaces a row of one-per-value
 * quick-filter chips with a single pill that opens a picker, so a long list
 * (categories, inventory conditions, etc.) doesn't have to be laid out flat. */
export function FilterPill({
  label,
  value,
  onValueChange,
  options,
  allValue = "all",
  className,
}: FilterPillProps) {
  const selected = options.find((o) => o.value === value);
  const isActive = value !== allValue;

  return (
    <DropdownMenu>
      <div
        className={cn(
          "flex items-center rounded-full border text-[12.5px] font-medium transition-colors shrink-0",
          isActive
            ? "border-primary/30 bg-primary/10 text-primary"
            : "border-border bg-transparent text-muted-foreground",
          className,
        )}
      >
        <DropdownMenuTrigger asChild>
          <button
            type="button"
            className="flex items-center gap-1.5 pl-3 pr-2 py-1.5 outline-none min-w-0"
          >
            <span className="shrink-0">{label}:</span>
            <span
              className={cn(
                "truncate max-w-[120px]",
                isActive ? "text-primary" : "text-foreground",
              )}
            >
              {selected?.label ?? "All"}
            </span>
            <ChevronDown className="h-3.5 w-3.5 opacity-60 shrink-0" />
          </button>
        </DropdownMenuTrigger>
        {isActive && (
          <button
            type="button"
            aria-label={`Clear ${label} filter`}
            className="pr-2.5 pl-0.5 py-1.5 hover:opacity-70 shrink-0"
            onClick={() => onValueChange(allValue)}
          >
            <X className="h-3.5 w-3.5" />
          </button>
        )}
      </div>
      <DropdownMenuContent align="start" className="w-[200px]">
        <DropdownMenuRadioGroup value={value} onValueChange={onValueChange}>
          {options.map((o) => (
            <DropdownMenuRadioItem key={o.value} value={o.value}>
              {o.label}
            </DropdownMenuRadioItem>
          ))}
        </DropdownMenuRadioGroup>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

export function formatFilterLabel(value: string, allLabel = "All") {
  if (value === "all") return allLabel;
  return value
    .replace(/_/g, " ")
    .split(" ")
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(" ");
}
