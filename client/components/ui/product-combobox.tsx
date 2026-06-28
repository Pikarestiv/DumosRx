"use client";

import * as React from "react";
import { Check, ChevronsUpDown, Database, Globe, Plus } from "lucide-react";

import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Command,
  CommandGroup,
  CommandItem,
  CommandList,
} from "@/components/ui/command";
import { useLocalData } from "@/lib/db/hooks/useLocalData";
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

  const { storeProfile } = useStore();
  const isPharmacy = storeProfile?.store_type === "pharmacy";

  // Fetch local products
  const { data: localProducts = [] } = useLocalData<any>(
    "SELECT id, name, brand_name, generic_name, category_id, manufacturer FROM products WHERE _deleted = 0 ORDER BY name ASC"
  );

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
          if (e.key === "Escape") setOpen(false);
        }}
        placeholder={placeholder}
        disabled={disabled}
        autoComplete="off"
        className="w-full"
      />
      
      {open && filteredOptions.length > 0 && (
        <div className="absolute z-[999] w-full mt-1 bg-popover text-popover-foreground shadow-xl rounded-md border border-border outline-none animate-in fade-in-0 zoom-in-95 overflow-hidden">
          <Command shouldFilter={false} className="bg-transparent">
            <CommandList className="max-h-[300px] overflow-y-auto p-1">
              <CommandGroup>
                {filteredOptions.map((option, idx) => (
                  <CommandItem
                    key={`${option.source}_${option.name}_${idx}`}
                    value={option.name}
                    onSelect={() => {
                      onChange(option);
                      setOpen(false);
                    }}
                    className="cursor-pointer flex flex-col items-start py-2 px-2 group"
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
                        <Database className="h-3 w-3 text-emerald-500 group-data-[selected='true']:text-accent-foreground ml-2 shrink-0" />
                      ) : (
                        <Globe className="h-3 w-3 text-blue-500 group-data-[selected='true']:text-accent-foreground ml-2 shrink-0" />
                      )}
                    </div>
                    {option.source === "local" && (
                      <div className="text-xs text-muted-foreground group-data-[selected='true']:text-accent-foreground/80 ml-6 mt-0.5 line-clamp-1">
                        In Catalog • {option.generic_name || option.brand_name || "Local Product"}
                      </div>
                    )}
                    {option.source === "global" && (
                      <div className="text-xs text-muted-foreground group-data-[selected='true']:text-accent-foreground/80 ml-6 mt-0.5 line-clamp-1">
                        Global Suggestion
                      </div>
                    )}
                  </CommandItem>
                ))}
              </CommandGroup>
            </CommandList>
          </Command>
        </div>
      )}
    </div>
  );
}
