"use client";

import { useRef } from "react";
import { ArrowDown, ArrowUp } from "lucide-react";
import { formatCurrency } from "@/lib/utils";
import type { SortDirection } from "@/lib/hooks/use-sortable-data";
import { ProductName } from "@/components/ui/product-name";
import { ScrollToTopButton } from "@/components/ui/scroll-to-top-button";
import type { ProductPerformanceRow } from "./product-performance-table";

export type ProductPerformanceSortKey = "name" | "category" | "revenue" | "units" | "margin";

interface ProductPerformanceMobileListProps {
  products: ProductPerformanceRow[];
  currencyCode?: string;
  sortKey: ProductPerformanceSortKey | null;
  direction: SortDirection;
  onToggleSort: (key: ProductPerformanceSortKey) => void;
}

const MOBILE_SORT_OPTIONS: { key: ProductPerformanceSortKey; label: string }[] = [
  { key: "revenue", label: "Revenue" },
  { key: "units", label: "Units" },
  { key: "margin", label: "Margin" },
  { key: "name", label: "Name" },
];

export function ProductPerformanceMobileList({
  products,
  currencyCode,
  sortKey,
  direction,
  onToggleSort,
}: ProductPerformanceMobileListProps) {
  const scrollRef = useRef<HTMLDivElement>(null);

  return (
    <div className="space-y-3">
      <div className="flex items-center gap-1.5 overflow-x-auto no-scrollbar pb-0.5">
        <span className="text-[11px] font-medium text-muted-foreground shrink-0 mr-1">
          Sort:
        </span>
        {MOBILE_SORT_OPTIONS.map((option) => {
          const isActive = sortKey === option.key;
          return (
            <button
              key={option.key}
              type="button"
              onClick={() => onToggleSort(option.key)}
              className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-[11.5px] font-medium border shrink-0 transition-colors ${
                isActive
                  ? "bg-primary/10 text-primary border-primary/30"
                  : "bg-background text-muted-foreground border-border hover:text-foreground"
              }`}
            >
              <span>{option.label}</span>
              {isActive &&
                (direction === "asc" ? (
                  <ArrowUp className="w-3 h-3" />
                ) : (
                  <ArrowDown className="w-3 h-3" />
                ))}
            </button>
          );
        })}
      </div>

      <div
        ref={scrollRef}
        className="space-y-2.5 max-h-[460px] overflow-y-auto pr-0.5"
      >
        {products.map((product) => (
          <div
            key={product.id}
            data-product-performance-card-mobile
            className="rounded-xl border border-border bg-background/60 p-3.5 space-y-2.5"
          >
            <div className="flex items-start justify-between gap-2.5">
              <div className="min-w-0 flex-1">
                <ProductName
                  name={product.name}
                  className="font-semibold text-[14px] leading-snug text-foreground line-clamp-2"
                />
                <div className="text-[12px] text-muted-foreground mt-0.5 truncate">
                  {product.category || "Uncategorized"}
                </div>
              </div>
              <div className="text-right shrink-0">
                <div className="text-[14.5px] font-bold text-foreground tabular-nums">
                  {formatCurrency(product.revenue, currencyCode)}
                </div>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3 pt-2 border-t border-border/50 text-[12px]">
              <div className="flex items-center justify-between gap-2">
                <span className="text-muted-foreground">Units sold</span>
                <span className="font-semibold text-foreground tabular-nums">
                  {product.units}
                </span>
              </div>
              <div className="flex items-center justify-between gap-2">
                <span className="text-muted-foreground">Margin</span>
                <span
                  className={`font-semibold tabular-nums ${
                    product.margin >= 0
                      ? "text-emerald-600 dark:text-emerald-400"
                      : "text-destructive"
                  }`}
                >
                  {product.margin.toFixed(0)}%
                </span>
              </div>
            </div>
          </div>
        ))}
      </div>
      <ScrollToTopButton scrollRef={scrollRef} />
    </div>
  );
}
