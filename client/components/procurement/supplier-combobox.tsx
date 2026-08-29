"use client";

import * as React from "react";
import { Check, Plus, X } from "lucide-react";
import { cn } from "@/lib/utils";
import { Input } from "@/components/ui/input";
import { genericFuzzySearch } from "@/lib/utils/search";

interface Supplier {
  id: string;
  name: string;
}

interface SupplierComboboxProps {
  /** Selected supplier id, or the SELF_PURCHASE_VENDOR_ID sentinel, or ""
   * when nothing has been chosen yet. */
  value: string;
  suppliers: Supplier[];
  onChange: (id: string) => void;
  onCreateNew: () => void;
  selfPurchaseId: string;
  placeholder?: string;
  className?: string;
}

/** Search-to-filter vendor picker, built on the same interaction pattern as
 * ProductCombobox: type to fuzzy-filter, click/scroll to pick, with
 * "Create Supplier" pinned at the top so it's never buried by a long
 * supplier list. Kept to the same column width as the fields around it —
 * a search input needs typing room, not extra column width. */
export function SupplierCombobox({
  value,
  suppliers,
  onChange,
  onCreateNew,
  selfPurchaseId,
  placeholder = "Search or select a vendor...",
  className,
}: SupplierComboboxProps) {
  const [open, setOpen] = React.useState(false);
  const [searchText, setSearchText] = React.useState("");
  const [activeIndex, setActiveIndex] = React.useState(-1);
  const containerRef = React.useRef<HTMLDivElement>(null);

  const selectedLabel = React.useMemo(() => {
    if (value === selfPurchaseId) return "Self / Walk-in Purchase";
    return suppliers.find((s) => s.id === value)?.name || "";
  }, [value, suppliers, selfPurchaseId]);

  // Shown while the dropdown is closed; while open, the user's own typing
  // (searchText) takes over so filtering isn't fighting the resolved label.
  const displayValue = open ? searchText : selectedLabel;

  const filteredSuppliers = React.useMemo(() => {
    if (!searchText) return suppliers;
    return genericFuzzySearch(searchText, suppliers, ["name"]).results;
  }, [searchText, suppliers]);

  React.useEffect(() => {
    setActiveIndex(-1);
  }, [searchText, open]);

  React.useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (
        containerRef.current &&
        !containerRef.current.contains(event.target as Node)
      ) {
        setOpen(false);
        setSearchText("");
      }
    };
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  const selectSupplier = (id: string) => {
    onChange(id);
    setSearchText("");
    setOpen(false);
  };

  return (
    <div className="relative w-full" ref={containerRef}>
      <div className="relative">
        <Input
          value={displayValue}
          onChange={(e) => {
            setSearchText(e.target.value);
            setOpen(true);
          }}
          onFocus={(e) => {
            setOpen(true);
            e.target.select();
          }}
          onKeyDown={(e) => {
            if (e.key === "Escape") {
              setOpen(false);
              setSearchText("");
            } else if (e.key === "ArrowDown") {
              e.preventDefault();
              if (!open) setOpen(true);
              setActiveIndex((prev) => Math.min(prev + 1, filteredSuppliers.length - 1));
            } else if (e.key === "ArrowUp") {
              e.preventDefault();
              setActiveIndex((prev) => Math.max(prev - 1, -1));
            } else if (e.key === "Enter") {
              if (open && activeIndex >= 0 && activeIndex < filteredSuppliers.length) {
                e.preventDefault();
                selectSupplier(filteredSuppliers[activeIndex].id);
              }
            }
          }}
          placeholder={placeholder}
          autoComplete="off"
          className={cn("w-full", displayValue && "pr-8", className)}
        />
        {displayValue && (
          <button
            type="button"
            onClick={() => {
              onChange("");
              setSearchText("");
              setOpen(false);
            }}
            className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
            aria-label="Clear"
          >
            <X className="h-4 w-4" />
          </button>
        )}
      </div>

      {open && (
        <div className="absolute z-[999] w-full mt-1 bg-popover text-popover-foreground shadow-xl rounded-md border border-border outline-none animate-in fade-in-0 zoom-in-95 overflow-hidden">
          <div className="max-h-[300px] overflow-y-auto hide-scrollbar p-1">
            <div
              onClick={() => {
                onCreateNew();
                setOpen(false);
                setSearchText("");
              }}
              className="relative flex cursor-pointer select-none items-center gap-1.5 rounded-sm py-2 px-2 mb-1 text-sm font-semibold outline-none bg-primary/10 text-primary hover:bg-primary/15"
            >
              <Plus className="h-4 w-4 shrink-0" />
              Create Supplier
            </div>

            <div
              onClick={() => selectSupplier(selfPurchaseId)}
              className={cn(
                "relative flex cursor-pointer select-none items-center rounded-sm py-2 px-2 text-sm outline-none hover:bg-accent hover:text-accent-foreground",
              )}
            >
              <Check
                className={cn(
                  "mr-2 h-4 w-4 shrink-0",
                  value === selfPurchaseId ? "opacity-100" : "opacity-0",
                )}
              />
              Self / Walk-in Purchase
            </div>

            {filteredSuppliers.map((supplier, idx) => (
              <div
                key={supplier.id}
                onClick={() => selectSupplier(supplier.id)}
                className={cn(
                  "relative flex cursor-pointer select-none items-center rounded-sm py-2 px-2 text-sm outline-none hover:bg-accent hover:text-accent-foreground",
                  idx === activeIndex && "bg-accent text-accent-foreground",
                )}
              >
                <Check
                  className={cn(
                    "mr-2 h-4 w-4 shrink-0",
                    value === supplier.id ? "opacity-100" : "opacity-0",
                  )}
                />
                {supplier.name}
              </div>
            ))}
            {searchText && filteredSuppliers.length === 0 && (
              <div className="px-2 py-3 text-center text-[12.5px] text-muted-foreground">
                No suppliers match &quot;{searchText}&quot;
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
