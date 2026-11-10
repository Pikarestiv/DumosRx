"use client";

import { Check, Database, Globe, Plus } from "lucide-react";
import { cn } from "@/lib/utils";
import { FORM_SUGGESTIONS } from "@/lib/constants/suggestions";
import { lowStockThreshold } from "@/lib/utils/stock-status";
import { useUppercaseDisplayClass } from "@/lib/hooks/use-uppercase-display";
import type { SelectedProduct } from "@/components/ui/product-combobox";

export function getGlobalSuggestions(isPharmacy: boolean): SelectedProduct[] {
  const list: SelectedProduct[] = [];
  const source = isPharmacy ? FORM_SUGGESTIONS.store : FORM_SUGGESTIONS.retail;

  if (source && source.products) {
    (
      source.products as {
        name: string;
        genericName?: string;
        manufacturer?: string;
        strength?: string;
        dosageForm?: string;
      }[]
    ).forEach((prod) => {
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
}

export function getProductStockPriority(item: SelectedProduct): number {
  if ((item.stock_owed ?? 0) > 0) return 0;
  if (item.stock_quantity !== undefined && item.stock_quantity !== null) {
    if (item.stock_quantity <= 0) return 1;
    if (item.stock_quantity <= lowStockThreshold(item.reorder_level)) return 2;
  }
  return 3;
}

export function sortComboboxOptions(options: SelectedProduct[]): SelectedProduct[] {
  return [...options].sort((a, b) => {
    if (a.source !== b.source) {
      return a.source === "local" ? -1 : 1;
    }
    const prioA = getProductStockPriority(a);
    const prioB = getProductStockPriority(b);
    if (prioA !== prioB) return prioA - prioB;

    if (prioA === 0) {
      const owedA = a.stock_owed ?? 0;
      const owedB = b.stock_owed ?? 0;
      if (owedA !== owedB) return owedB - owedA;
    }

    if (prioA === 2) {
      const qtyA = a.stock_quantity ?? 0;
      const qtyB = b.stock_quantity ?? 0;
      if (qtyA !== qtyB) return qtyA - qtyB;
    }

    return 0;
  });
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

export function StockStatusBadge({
  option,
  active = false,
}: {
  option: SelectedProduct;
  active?: boolean;
}) {
  if (option.stock_owed && option.stock_owed > 0) {
    return (
      <span
        className={cn(
          "ml-2 shrink-0 inline-flex items-center rounded-full px-1.5 py-0.5 text-[10px] font-semibold whitespace-nowrap transition-colors",
          active
            ? "bg-white text-amber-800 border-white shadow-sm dark:bg-slate-900 dark:text-amber-300 dark:border-slate-800"
            : "bg-amber-500/15 text-amber-700 dark:text-amber-300 border border-amber-500/30 group-hover:bg-white group-hover:text-amber-800 group-hover:border-white group-hover:shadow-sm dark:group-hover:bg-slate-900 dark:group-hover:text-amber-300 dark:group-hover:border-slate-800",
        )}
      >
        {option.stock_owed} owed
      </span>
    );
  }
  if (option.stock_quantity !== undefined && option.stock_quantity !== null) {
    if (option.stock_quantity <= 0) {
      return (
        <span
          className={cn(
            "ml-2 shrink-0 inline-flex items-center rounded-full px-1.5 py-0.5 text-[10px] font-semibold whitespace-nowrap transition-colors",
            active
              ? "bg-white text-rose-800 border-white shadow-sm dark:bg-slate-900 dark:text-rose-300 dark:border-slate-800"
              : "bg-rose-500/15 text-rose-700 dark:text-rose-300 border border-rose-500/30 group-hover:bg-white group-hover:text-rose-800 group-hover:border-white group-hover:shadow-sm dark:group-hover:bg-slate-900 dark:group-hover:text-rose-300 dark:group-hover:border-slate-800",
          )}
        >
          0 in stock
        </span>
      );
    }
    if (option.stock_quantity <= lowStockThreshold(option.reorder_level)) {
      return (
        <span
          className={cn(
            "ml-2 shrink-0 inline-flex items-center rounded-full px-1.5 py-0.5 text-[10px] font-semibold whitespace-nowrap transition-colors",
            active
              ? "bg-white text-orange-800 border-white shadow-sm dark:bg-slate-900 dark:text-orange-300 dark:border-slate-800"
              : "bg-orange-500/15 text-orange-700 dark:text-orange-300 border border-orange-500/30 group-hover:bg-white group-hover:text-orange-800 group-hover:border-white group-hover:shadow-sm dark:group-hover:bg-slate-900 dark:group-hover:text-orange-300 dark:group-hover:border-slate-800",
          )}
        >
          Low ({option.stock_quantity})
        </span>
      );
    }
    return (
      <span
        className={cn(
          "ml-2 shrink-0 inline-flex items-center rounded-full px-1.5 py-0.5 text-[10px] whitespace-nowrap transition-colors",
          active
            ? "bg-white text-slate-800 font-medium border-white shadow-sm dark:bg-slate-900 dark:text-slate-100 dark:border-slate-800"
            : "bg-muted/60 text-muted-foreground border border-border/50 group-hover:bg-white group-hover:text-slate-800 group-hover:font-medium group-hover:border-white group-hover:shadow-sm dark:group-hover:bg-slate-900 dark:group-hover:text-slate-100 dark:group-hover:border-slate-800",
        )}
      >
        {option.stock_quantity} in stock
      </span>
    );
  }
  return null;
}

export function ComboboxSectionHeader({ label }: { label: string }) {
  return (
    <div
      role="presentation"
      className="px-2 pt-2.5 pb-1 text-[10px] font-bold text-muted-foreground uppercase tracking-wider select-none bg-popover"
    >
      {label}
    </div>
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
  const capsClass = useUppercaseDisplayClass();

  return (
    <div
      id={id}
      role="option"
      aria-selected={isSelected}
      onMouseDown={(e) => {
        if (e.button !== 0) return;
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
        <span className={cn("truncate flex-1 font-medium", capsClass)}>
          {option.name}
        </span>
        {option.source === "local" ? (
          option.stock_owed !== undefined || option.stock_quantity !== undefined ? (
            <StockStatusBadge option={option} active={isActive} />
          ) : (
            <SourceBadge source="local" active={isActive} />
          )
        ) : (
          <SourceBadge source="global" active={isActive} />
        )}
      </div>
      {(option.generic_name || option.category) && (
        <div className="pl-6 text-xs text-muted-foreground group-hover:text-accent-foreground/80 mt-0.5 w-full truncate">
          <span
            className={cn(
              "italic",
              capsClass,
              isActive && "text-accent-foreground/80",
            )}
          >
            {option.generic_name || option.category}
          </span>
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
  const capsClass = useUppercaseDisplayClass();

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
      {value ? (
        <span className="truncate">
          Create &ldquo;<span className={capsClass}>{value}</span>&rdquo; as new product
        </span>
      ) : (
        "Create New Product"
      )}
    </div>
  );
}
