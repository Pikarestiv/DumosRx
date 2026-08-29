"use client";

import * as React from "react";
import { Check, Database, Globe, Plus, X } from "lucide-react";

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
  /** Called only when the value is cleared via the explicit clear (X)
   * button, not when the user backspaces the field to empty. Lets
   * consumers reset fields that were autofilled from the selection
   * without wiping them out on incidental retyping. */
  onClear?: () => void;
  placeholder?: string;
  disabled?: boolean;
  className?: string;
  /** When false, the dropdown only shows real catalog matches and the
   * "create new" fallback — never the static reference-list ("Suggested")
   * names. Used by PO item search, where catalog results and non-catalog
   * name suggestions must never appear in the same list. Defaults to true
   * to preserve existing behavior (e.g. the new-product name field, where
   * suggesting non-catalog names is exactly the point). */
  showGlobalSuggestions?: boolean;
  /** Fired only when the user explicitly clicks "Add "X" as new product",
   * not on every keystroke. Optional — callers that don't pass it keep the
   * existing onChange({ source: "new" }) behavior for that click. */
  onCreateNew?: (name: string) => void;
}

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

function ProductComboboxItem({
  option,
  isSelected,
  isActive,
  onSelect,
}: {
  option: SelectedProduct;
  isSelected: boolean;
  isActive: boolean;
  onSelect: () => void;
}) {
  return (
    <div
      onClick={onSelect}
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

function AddNewProductOption({
  value,
  isActive,
  onSelect,
}: {
  value: string;
  isActive: boolean;
  onSelect: () => void;
}) {
  return (
    <div
      onClick={onSelect}
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

export function ProductCombobox({
  value,
  onChange,
  onClear,
  placeholder = "Search products...",
  disabled = false,
  className,
  showGlobalSuggestions = true,
  onCreateNew,
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
    if (!showGlobalSuggestions) return [];
    const list: SelectedProduct[] = [];
    const source = isPharmacy
      ? FORM_SUGGESTIONS.store
      : FORM_SUGGESTIONS.retail;

    if (source && source.products) {
      (source.products as {
        name: string;
        genericName?: string;
        manufacturer?: string;
        strength?: string;
        dosageForm?: string;
      }[]).forEach((prod) => {
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
  }, [isPharmacy, showGlobalSuggestions]);

  // Map local products
  const localSuggestions = React.useMemo(() => {
    return localProducts.map((p) => ({
      name: p.name,
      source: "local" as ProductSource,
      localId: p.id,
      generic_name: p.generic_name,
      category: p.category_name,
      manufacturer: p.manufacturer,
      strength: p.strength,
      dosageForm: p.dosage_form,
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
    // suggestions/other stores' products, regardless of fuzzy-match score:
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
      <div className="relative">
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
          className={cn("w-full", value && !disabled && "pr-8", className)}
        />
        {value && !disabled && (
          <button
            type="button"
            onClick={() => {
              onChange({ name: "", source: "new" });
              onClear?.();
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
            {/* Always pinned above matches, whether or not anything is typed:
             * with no text it opens an empty "Add New Product" form (a real
             * discoverable entry point, not a dead end); once text exists the
             * label switches to reflect it, and it stays pinned regardless of
             * whether a fuzzy match happens to also exist below it. */}
            <AddNewProductOption
              value={value}
              isActive={activeIndex === -1}
              onSelect={() => {
                if (onCreateNew) {
                  onCreateNew(value);
                } else {
                  onChange({ name: value, source: "new" });
                }
                setOpen(false);
              }}
            />
            {filteredOptions.map((option, idx) => (
              <ProductComboboxItem
                key={`${option.source}_${option.name}_${idx}`}
                option={option}
                isSelected={value === option.name}
                isActive={idx === activeIndex}
                onSelect={() => {
                  onChange(option);
                  setOpen(false);
                }}
              />
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
