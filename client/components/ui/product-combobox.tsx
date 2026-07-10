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
  brand_name?: string;
  generic_name?: string;
  category?: string;
  manufacturer?: string;
}

interface ProductComboboxProps {
  value: string;
  onChange: (product: SelectedProduct) => void;
  placeholder?: string;
  disabled?: boolean;
}

export function ProductCombobox({
  value,
  onChange,
  placeholder = "Search products...",
  disabled = false,
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
    const source = isPharmacy ? FORM_SUGGESTIONS.store : FORM_SUGGESTIONS.retail;
    
    if (source && source.names) {
      source.names.forEach((name: string) => {
        list.push({
          name,
          source: "global",
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
      brand_name: p.brand_name,
      generic_name: p.generic_name,
      category: p.category_id,
      manufacturer: p.manufacturer,
    }));
  }, [localProducts]);

  const allSuggestions = [...localSuggestions, ...globalSuggestions];

  const filteredOptions = React.useMemo(() => {
    if (!value) return allSuggestions.slice(0, 50); // Limit initial display
    
    const { results } = genericFuzzySearch(value, allSuggestions, [
      "name",
      "brand_name",
      "generic_name",
    ]);

    return results.slice(0, 50);
  }, [value, allSuggestions]);

  // Handle clicks outside to close the menu
  React.useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(event.target as Node)) {
        setOpen(false)
      }
    }
    document.addEventListener("mousedown", handleClickOutside)
    return () => document.removeEventListener("mousedown", handleClickOutside)
  }, [])

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
            setActiveIndex((prev) => Math.min(prev + 1, filteredOptions.length - 1));
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
        className="w-full"
      />
      
      {open && filteredOptions.length > 0 && (
        <div className="absolute z-[999] w-full mt-1 bg-popover text-popover-foreground shadow-xl rounded-md border border-border outline-none animate-in fade-in-0 zoom-in-95 overflow-hidden">
          <div className="max-h-[300px] overflow-y-auto p-1">
            {filteredOptions.map((option, idx) => (
              <div
                key={`${option.source}_${option.name}_${idx}`}
                onClick={() => {
                  onChange(option);
                  setOpen(false);
                }}
                className={cn(
                  "relative flex cursor-pointer select-none flex-col items-start rounded-sm py-2 px-2 text-sm outline-none hover:bg-accent hover:text-accent-foreground group",
                  idx === activeIndex && "bg-accent text-accent-foreground"
                )}
              >
                <div className="flex items-center w-full">
                  <Check
                    className={cn(
                      "mr-2 h-4 w-4 shrink-0",
                      value === option.name ? "opacity-100" : "opacity-0"
                    )}
                  />
                  <span className="truncate flex-1 font-medium">{option.name}</span>
                  {option.source === "local" ? (
                    <Database className={cn("h-3 w-3 ml-2 shrink-0", idx === activeIndex ? "text-accent-foreground" : "text-emerald-500 group-hover:text-accent-foreground")} />
                  ) : option.source === "global" ? (
                    <Globe className={cn("h-3 w-3 ml-2 shrink-0", idx === activeIndex ? "text-accent-foreground" : "text-blue-500 group-hover:text-accent-foreground")} />
                  ) : null}
                </div>
                {(option.generic_name || option.brand_name) && (
                  <div className="pl-6 text-xs text-muted-foreground mt-0.5 w-full truncate">
                    {option.generic_name && (
                      <span className="italic">{option.generic_name}</span>
                    )}
                    {option.generic_name && option.brand_name && (
                      <span className="mx-1">•</span>
                    )}
                    {option.brand_name && <span>{option.brand_name}</span>}
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
                  activeIndex === filteredOptions.length && "bg-accent text-accent-foreground"
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
