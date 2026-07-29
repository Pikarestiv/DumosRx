"use client";

import * as React from "react";
import { Check, Database, Globe, Plus } from "lucide-react";

import { cn } from "@/lib/utils";

import { Input } from "@/components/ui/input";
import { useProductList } from "@/lib/hooks/use-product-list";
import { FORM_SUGGESTIONS } from "@/lib/constants/suggestions";
import { useStore } from "@/lib/context/store-context";
import { genericFuzzySearch } from "@/lib/utils/search";

export type ProductSource = "local" | "global" | "new";

export interface SelectedProduct {
  name: string;
  source: ProductSource;
  localId?: string;
  generic_name?: string;
  category?: string;
  manufacturer?: string;
  strength?: string;
  dosageForm?: string;
}

interface ProductComboboxProps {
  value: string;
  onChange: (product: SelectedProduct) => void;
  placeholder?: string;
  disabled?: boolean;
  className?: string;
}

export function ProductCombobox({
  value,
  onChange,
  placeholder = "Search products...",
  disabled = false,
  className,
}: ProductComboboxProps) {
  const [open, setOpen] = React.useState(false);
  const containerRef = React.useRef<HTMLDivElement>(null);
  const [activeIndex, setActiveIndex] = React.useState(-1);

  React.useEffect(() => {
    setActiveIndex(-1);
  }, [value, open]);

  const { storeProfile } = useStore();
  const isPharmacy = storeProfile?.store_type === "pharmacy";

  // Fetch local products
  const { data: localProducts = [] } = useProductList();

  // Compile global suggestions
  const globalSuggestions = React.useMemo(() => {
    const list: SelectedProduct[] = [];
    const source = isPharmacy
      ? FORM_SUGGESTIONS.store
      : FORM_SUGGESTIONS.retail;

    if (source && source.products) {
      source.products.forEach((prod: any) => {
        list.push({
          name: prod.name,
          source: "global",
          generic_name: prod.genericName,
          manufacturer: prod.manufacturer,
          strength: prod.strength,
          dosageForm: prod.dosageForm,
        });
      });
    }
    return list;
  }, [isPharmacy]);

  // Map local products
  const localSuggestions = React.useMemo(() => {
    return localProducts.map((p: any) => ({
      name: p.name,
      source: "local" as ProductSource,
      localId: p.id,
      generic_name: p.generic_name,
      category: p.category_id,
      manufacturer: p.manufacturer,
    }));
  }, [localProducts]);

  const allSuggestions = [...localSuggestions, ...globalSuggestions];
  const deferredValue = React.useDeferredValue(value);

  const filteredOptions = React.useMemo(() => {
    const base = !deferredValue
      ? allSuggestions.slice(0, 50) // Limit initial display
      : genericFuzzySearch(deferredValue, allSuggestions, [
          "name",
          "generic_name",
        ]).results.slice(0, 50);

    // Always show products already in this store's inventory before global
    // suggestions/other stores' products, regardless of fuzzy-match score —
    // that's almost always the correct pick (it's the one with real stock
    // and pricing), and a new user shouldn't have to know to look for it.
    // Array.sort is stable, so this only reorders across the two groups,
    // never within one.
    return [...base].sort((a, b) => {
      if (a.source === b.source) return 0;
      return a.source === "local" ? -1 : b.source === "local" ? 1 : 0;
    });
  }, [deferredValue, allSuggestions]);

  // Handle clicks outside to close the menu
  React.useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (
        containerRef.current &&
        !containerRef.current.contains(event.target as Node)
      ) {
        setOpen(false);
      }
    };
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  return (
    <div className="relative w-full" ref={containerRef}>
      <Input
        value={value}
        onChange={(e: React.ChangeEvent<HTMLInputElement>) => {
          onChange({ name: e.target.value, source: "new" });
          setOpen(true);
        }}
        onFocus={() => setOpen(true)}
        onKeyDown={(e: React.KeyboardEvent<HTMLInputElement>) => {
          if (e.key === "Escape") {
            setOpen(false);
          } else if (e.key === "ArrowDown") {
            e.preventDefault();
            if (!open) setOpen(true);
            setActiveIndex((prev) =>
              Math.min(prev + 1, filteredOptions.length - 1),
            );
          } else if (e.key === "ArrowUp") {
            e.preventDefault();
            setActiveIndex((prev) => Math.max(prev - 1, 0));
          } else if (e.key === "Enter") {
            if (open) {
              e.preventDefault();
              if (activeIndex >= 0 && activeIndex < filteredOptions.length) {
                onChange(filteredOptions[activeIndex]);
              }
              setOpen(false);
            }
          }
        }}
        placeholder={placeholder}
        disabled={disabled}
        autoComplete="off"
        className={cn("w-full", className)}
      />

      {open && filteredOptions.length > 0 && (
        <div className="absolute z-[999] w-full mt-1 bg-popover text-popover-foreground shadow-xl rounded-md border border-border outline-none animate-in fade-in-0 zoom-in-95 overflow-hidden">
          <div className="max-h-[300px] overflow-y-auto hide-scrollbar p-1">
            {filteredOptions.map((option, idx) => (
              <div
                key={`${option.source}_${option.name}_${idx}`}
                onClick={() => {
                  onChange(option);
                  setOpen(false);
                }}
                className={cn(
                  "relative flex cursor-pointer select-none flex-col items-start rounded-sm py-2 px-2 text-sm outline-none hover:bg-accent hover:text-accent-foreground group",
                  idx === activeIndex && "bg-accent text-accent-foreground",
                )}
              >
                <div className="flex items-center w-full">
                  <Check
                    className={cn(
                      "mr-2 h-4 w-4 shrink-0",
                      value === option.name ? "opacity-100" : "opacity-0",
                    )}
                  />
                  <span className="truncate flex-1 font-medium">
                    {option.name}
                  </span>
                  {option.source === "local" ? (
                    <span
                      className={cn(
                        "ml-2 shrink-0 inline-flex items-center gap-1 rounded-full px-1.5 py-0.5 text-[10px] font-semibold whitespace-nowrap",
                        idx === activeIndex
                          ? "bg-accent-foreground/10 text-accent-foreground"
                          : "bg-emerald-500/10 text-emerald-600",
                      )}
                    >
                      <Database className="h-2.5 w-2.5" />
                      In Catalog
                    </span>
                  ) : option.source === "global" ? (
                    <span
                      className={cn(
                        "ml-2 shrink-0 inline-flex items-center gap-1 rounded-full px-1.5 py-0.5 text-[10px] font-semibold whitespace-nowrap",
                        idx === activeIndex
                          ? "bg-accent-foreground/10 text-accent-foreground"
                          : "bg-blue-500/10 text-blue-600",
                      )}
                    >
                      <Globe className="h-2.5 w-2.5" />
                      Suggested
                    </span>
                  ) : null}
                </div>
                {option.generic_name && (
                  <div className="pl-6 text-xs text-muted-foreground mt-0.5 w-full truncate">
                    <span className="italic">{option.generic_name}</span>
                  </div>
                )}
              </div>
            ))}
            {value && filteredOptions.length === 0 && (
              <div
                onClick={() => {
                  onChange({ name: value, source: "new" });
                  setOpen(false);
                }}
                className={cn(
                  "relative flex cursor-pointer select-none items-center rounded-sm py-2 px-2 text-sm outline-none hover:bg-accent hover:text-accent-foreground",
                  activeIndex === filteredOptions.length &&
                    "bg-accent text-accent-foreground",
                )}
              >
                <Plus className="mr-2 h-4 w-4 shrink-0" />
                Add "{value}" as new product
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
