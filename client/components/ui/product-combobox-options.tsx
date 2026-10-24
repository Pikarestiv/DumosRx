"use client";

import { Check, Database, Globe, Plus } from "lucide-react";
import { cn } from "@/lib/utils";
import type { SelectedProduct } from "@/components/ui/product-combobox";

function SourceBadge({
  source,
  active,
}: {
  source: "local" | "global";
  active: boolean;
}) {
  if (source === "local") {
    return (
      <span
        className={cn(
          "ml-2 shrink-0 inline-flex items-center gap-1 rounded-full px-1.5 py-0.5 text-[10px] font-semibold whitespace-nowrap group-hover:bg-white",
          active
            ? "bg-accent-foreground/10 text-accent-foreground"
            : "bg-emerald-500/10 text-emerald-600",
        )}
      >
        <Database className="h-2.5 w-2.5" />
        In Catalog
      </span>
    );
  }
  return (
    <span
      className={cn(
        "ml-2 shrink-0 inline-flex items-center gap-1 rounded-full px-1.5 py-0.5 text-[10px] font-semibold whitespace-nowrap group-hover:bg-white",
        active
          ? "bg-accent-foreground/10 text-accent-foreground"
          : "bg-blue-500/10 text-blue-600",
      )}
    >
      <Globe className="h-2.5 w-2.5" />
      Suggested
    </span>
  );
}

export function ProductComboboxItem({
  id,
  option,
  isSelected,
  isActive,
  onSelect,
}: {
  id: string;
  option: SelectedProduct;
  isSelected: boolean;
  isActive: boolean;
  onSelect: () => void;
}) {
  return (
    <div
      id={id}
      role="option"
      aria-selected={isSelected}
      // The input keeps DOM focus and drives this list via aria-activedescendant, so options are not themselves tabbable.
      // Rationale: docs/CLIENT_COMMENTS.md#line-components-ui-product-combobox-tsx-L131
      onMouseDown={(e) => {
        if (e.button !== 0) return; // left-click/primary touch only
        e.preventDefault();
        onSelect();
      }}
      className={cn(
        "relative flex cursor-pointer select-none flex-col items-start rounded-sm py-2 px-2 text-sm outline-none hover:bg-accent hover:text-accent-foreground group",
        isActive && "bg-accent text-accent-foreground",
      )}
    >
      <div className="flex items-center w-full">
        <Check
          className={cn(
            "mr-2 h-4 w-4 shrink-0",
            isSelected ? "opacity-100" : "opacity-0",
          )}
        />
        <span className="truncate flex-1 font-medium">{option.name}</span>
        {(option.source === "local" || option.source === "global") && (
          <SourceBadge source={option.source} active={isActive} />
        )}
      </div>
      {option.generic_name && (
        <div className="pl-6 text-xs text-muted-foreground group-hover:text-accent-foreground/70 mt-0.5 w-full truncate">
          <span className="italic">{option.generic_name}</span>
        </div>
      )}
    </div>
  );
}

export function AddNewProductOption({
  id,
  value,
  isActive,
  onSelect,
}: {
  id: string;
  value: string;
  isActive: boolean;
  onSelect: () => void;
}) {
  return (
    <div
      id={id}
      role="option"
      aria-selected={isActive}
      onMouseDown={(e) => {
        if (e.button !== 0) return;
        e.preventDefault();
        onSelect();
      }}
      className={cn(
        "relative flex cursor-pointer select-none items-center gap-1.5 rounded-sm py-2 px-2 mb-1 text-sm font-semibold outline-none bg-primary/10 text-primary hover:bg-primary/15",
        isActive && "bg-primary/20",
      )}
    >
      <Plus className="h-4 w-4 shrink-0" />
      {value ? `Create "${value}" as new product` : "Create New Product"}
    </div>
  );
}
