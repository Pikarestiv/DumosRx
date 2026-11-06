"use client";

import * as React from "react";
import { Search, X } from "lucide-react";

import { cn } from "@/lib/utils";

import { Input } from "@/components/ui/input";
import { useProductList } from "@/lib/hooks/use-product-list";
import { useStore } from "@/lib/context/store-context";
import { useUppercaseDisplayClass } from "@/lib/hooks/use-uppercase-display";
import { genericFuzzySearch } from "@/lib/utils/search";
import {
  AddNewProductOption,
  ComboboxSectionHeader,
  getGlobalSuggestions,
  getProductStockPriority,
  ProductComboboxItem,
  sortComboboxOptions,
} from "@/components/ui/product-combobox-options";

export type ProductSource = "local" | "global" | "new";

export interface SelectedProduct {
  name: string;
  source: ProductSource;
  localId?: string;
  generic_name?: string;
  barcode?: string;
  category?: string;
  manufacturer?: string;
  strength?: string;
  dosageForm?: string;
  stock_quantity?: number;
  stock_owed?: number;
  reorder_level?: number | null;
}

export interface ComboboxProductItem {
  id: string;
  name: string;
  generic_name?: string | null;
  barcode?: string | null;
  category_name?: string | null;
  manufacturer?: string | null;
  strength?: string | null;
  dosage_form?: string | null;
  stock_quantity?: number;
  stock_owed?: number;
  reorder_level?: number | null;
}

interface ProductComboboxProps {
  value: string;
  onChange: (product: SelectedProduct) => void;
  onClear?: () => void;
  placeholder?: string;
  disabled?: boolean;
  className?: string;
  showGlobalSuggestions?: boolean;
  onCreateNew?: (name: string) => void;
  showCreateNewOption?: boolean;
  showSearchIcon?: boolean;
  inputRef?: React.Ref<HTMLInputElement>;
  products?: ComboboxProductItem[];
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
  showCreateNewOption = true,
  showSearchIcon = false,
  inputRef,
  products,
}: ProductComboboxProps) {
  const [open, setOpen] = React.useState(false);
  const containerRef = React.useRef<HTMLDivElement>(null);
  const listRef = React.useRef<HTMLDivElement>(null);
  const [activeIndex, setActiveIndex] = React.useState(-1);
  const listboxId = React.useId();
  const optionId = (idx: number) =>
    idx === -1 ? `${listboxId}-create` : `${listboxId}-opt-${idx}`;
  const activeDescendant =
    open && (activeIndex >= 0 || showCreateNewOption)
      ? optionId(activeIndex)
      : undefined;

  const [indexedSearch, setIndexedSearch] = React.useState({ value, open });
  if (indexedSearch.value !== value || indexedSearch.open !== open) {
    setIndexedSearch({ value, open });
    setActiveIndex(-1);
  }

  const { storeProfile } = useStore();
  const isPharmacy = storeProfile?.store_type === "pharmacy";
  const capsClass = useUppercaseDisplayClass();

  const { data: queriedProducts = [] } = useProductList({
    enabled: !products,
  });
  const localProducts = products ?? queriedProducts;

  const globalSuggestions = React.useMemo(() => {
    if (!showGlobalSuggestions) return [];
    return getGlobalSuggestions(isPharmacy);
  }, [isPharmacy, showGlobalSuggestions]);

  const localSuggestions = React.useMemo(() => {
    return localProducts.map((p) => {
      const item = p as ComboboxProductItem;
      return {
        name: item.name,
        source: "local" as ProductSource,
        localId: item.id,
        generic_name: item.generic_name ?? undefined,
        barcode: item.barcode ?? undefined,
        category: item.category_name ?? undefined,
        manufacturer: item.manufacturer ?? undefined,
        strength: item.strength ?? undefined,
        dosageForm: item.dosage_form ?? undefined,
        stock_quantity: item.stock_quantity,
        stock_owed: item.stock_owed,
        reorder_level: item.reorder_level,
      };
    });
  }, [localProducts]);

  const allSuggestions = React.useMemo(
    () => [...localSuggestions, ...globalSuggestions],
    [localSuggestions, globalSuggestions],
  );
  const deferredValue = React.useDeferredValue(value);

  const filteredOptions = React.useMemo(() => {
    if (!deferredValue) {
      return sortComboboxOptions(allSuggestions).slice(0, 50);
    }
    const results = genericFuzzySearch(deferredValue, allSuggestions, [
      "name",
      "generic_name",
      "barcode",
    ]).results;
    return sortComboboxOptions(results).slice(0, 50);
  }, [deferredValue, allSuggestions]);

  const hasRestockSection =
    !deferredValue &&
    filteredOptions.some((o) => getProductStockPriority(o) < 3);

  React.useEffect(() => {
    if (!open) return;
    const safeId = typeof CSS !== "undefined" && CSS.escape ? CSS.escape(optionId(activeIndex)) : optionId(activeIndex);
    const el = listRef.current?.querySelector<HTMLElement>(`#${safeId}`);
    el?.scrollIntoView({ block: "nearest" });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeIndex, open]);

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
        {showSearchIcon && (
          <Search className="hidden sm:block absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground pointer-events-none" />
        )}
        <Input
          ref={inputRef}
          role="combobox"
          aria-expanded={open}
          aria-controls={open ? listboxId : undefined}
          aria-autocomplete="list"
          aria-activedescendant={activeDescendant}
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
              if (!open) setOpen(true);
              setActiveIndex((prev) =>
                Math.max(prev - 1, showCreateNewOption ? -1 : 0),
              );
            } else if (e.key === "Home") {
              if (open) {
                e.preventDefault();
                setActiveIndex(showCreateNewOption ? -1 : 0);
              }
            } else if (e.key === "End") {
              if (open) {
                e.preventDefault();
                setActiveIndex(filteredOptions.length - 1);
              }
            } else if (e.key === "Enter") {
              if (open) {
                e.preventDefault();
                if (activeIndex >= 0 && activeIndex < filteredOptions.length) {
                  onChange(filteredOptions[activeIndex]);
                } else if (activeIndex === -1 && showCreateNewOption) {
                  if (onCreateNew) {
                    onCreateNew(value);
                  } else {
                    onChange({ name: value, source: "new" });
                  }
                }
                setOpen(false);
              }
            } else if (e.key === "Tab") {
              setOpen(false);
            }
          }}
          placeholder={placeholder}
          disabled={disabled}
          autoComplete="off"
          className={cn(
            "w-full",
            showSearchIcon && "sm:pl-9",
            value && !disabled && "pr-8",
            capsClass,
            className,
          )}
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

      {open && (showCreateNewOption || filteredOptions.length > 0) && (
        <div className="absolute z-[999] w-full mt-1 bg-popover text-popover-foreground shadow-xl rounded-md border border-border outline-none animate-in fade-in-0 zoom-in-95 overflow-hidden">
          <div
            ref={listRef}
            id={listboxId}
            role="listbox"
            aria-label={placeholder}
            className="max-h-[300px] overflow-y-auto stable-scrollbar p-1"
          >
            {showCreateNewOption && (
              <AddNewProductOption
                id={optionId(-1)}
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
            )}
            {filteredOptions.map((option, idx) => {
              const showRestockHeader =
                hasRestockSection &&
                idx === 0 &&
                getProductStockPriority(option) < 3;
              const showAllHeader =
                hasRestockSection &&
                getProductStockPriority(option) === 3 &&
                (idx === 0 || getProductStockPriority(filteredOptions[idx - 1]) < 3);

              return (
                <React.Fragment key={`${option.source}_${option.name}_${idx}`}>
                  {showRestockHeader && (
                    <ComboboxSectionHeader label="Needs Restocking" />
                  )}
                  {showAllHeader && (
                    <ComboboxSectionHeader label="All Products" />
                  )}
                  <ProductComboboxItem
                    id={optionId(idx)}
                    option={option}
                    isSelected={value === option.name}
                    isActive={idx === activeIndex}
                    onSelect={() => {
                      onChange(option);
                      setOpen(false);
                    }}
                  />
                </React.Fragment>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}
