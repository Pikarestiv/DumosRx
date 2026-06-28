"use client";

import * as React from "react";
import { Check, ChevronsUpDown, Database, Globe, Plus } from "lucide-react";

import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/components/ui/command";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { useLocalData } from "@/lib/db/hooks/useLocalData";
import { FORM_SUGGESTIONS } from "@/lib/constants/suggestions";
import { useStore } from "@/lib/context/store-context";

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
  const [inputValue, setInputValue] = React.useState("");

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
    
    // For now, we just map names. Ideally FORM_SUGGESTIONS would have rich objects
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
    if (!inputValue) return allSuggestions.slice(0, 50); // Limit initial display
    
    const lowerInput = inputValue.toLowerCase();
    
    const filtered = allSuggestions
      .filter((s) => s.name.toLowerCase().includes(lowerInput))
      .slice(0, 50);

    return filtered;
  }, [inputValue, allSuggestions]);

  const exactMatchExists = React.useMemo(() => {
    return allSuggestions.some(s => s.name.toLowerCase() === inputValue.toLowerCase());
  }, [inputValue, allSuggestions]);

  return (
    <Popover open={open} onOpenChange={setOpen} modal={false}>
      <PopoverTrigger asChild>
        <Button
          variant="outline"
          role="combobox"
          aria-expanded={open}
          disabled={disabled}
          className="w-full justify-between font-normal bg-transparent border-input shadow-sm"
        >
          <span className="truncate">{value || placeholder}</span>
          <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
        </Button>
      </PopoverTrigger>
      <PopoverContent
        className="w-[--radix-popover-trigger-width] p-0"
        align="start"
        onFocusOutside={(e) => e.preventDefault()}
      >
        <Command shouldFilter={false}>
          <CommandInput 
            placeholder="Type to search..." 
            value={inputValue}
            onValueChange={setInputValue}
          />
          <CommandList className="max-h-[300px] overflow-y-auto">
            <CommandEmpty>
              <div className="p-4 text-center text-sm text-muted-foreground">
                No matching products found.
              </div>
            </CommandEmpty>
            <CommandGroup>
              {inputValue && !exactMatchExists && (
                <CommandItem
                  value={`new_${inputValue}`}
                  onSelect={() => {
                    onChange({ name: inputValue, source: "new" });
                    setOpen(false);
                    setInputValue("");
                  }}
                  className="font-medium text-primary cursor-pointer border-b mb-1 pb-2"
                >
                  <Plus className="mr-2 h-4 w-4" />
                  Add "{inputValue}" as new product
                </CommandItem>
              )}
              {filteredOptions.map((option, idx) => (
                <CommandItem
                  key={`${option.source}_${option.name}_${idx}`}
                  value={option.name}
                  onSelect={() => {
                    onChange(option);
                    setOpen(false);
                    setInputValue("");
                  }}
                  className="cursor-pointer flex flex-col items-start py-2"
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
                      <Database className="h-3 w-3 text-emerald-500 ml-2 shrink-0" />
                    ) : (
                      <Globe className="h-3 w-3 text-blue-500 ml-2 shrink-0" />
                    )}
                  </div>
                  {option.source === "local" && (
                    <div className="text-xs text-muted-foreground ml-6 mt-0.5 line-clamp-1">
                      In Catalog • {option.generic_name || option.brand_name || "Local Product"}
                    </div>
                  )}
                  {option.source === "global" && (
                    <div className="text-xs text-muted-foreground ml-6 mt-0.5 line-clamp-1">
                      Global Suggestion
                    </div>
                  )}
                </CommandItem>
              ))}
            </CommandGroup>
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  );
}
