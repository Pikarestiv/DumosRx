"use client";

import { useEffect, useId, useMemo, useRef, useState } from "react";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import { searchProducts } from "@/lib/utils/search";
import { useUppercaseDisplayClass } from "@/lib/hooks/use-uppercase-display";
import type { TransferableProductRow } from "@/lib/db/queries/stock-transfers";

// The Transfer Stock dialog's product picker.
// Rationale: docs/CLIENT_COMMENTS.md#block-components-stock-batch-transfer-product-picker-tsx-L10
export function TransferProductPicker({
  products,
  loading,
  disabled,
  productId,
  onSelect,
  placeholder,
  emptyText,
  showQuantities,
}: {
  products: TransferableProductRow[];
  loading: boolean;
  disabled: boolean;
  productId: string;
  onSelect: (id: string) => void;
  placeholder: string;
  emptyText: string;
  showQuantities: boolean;
}) {
  const [open, setOpen] = useState(false);
  const [term, setTerm] = useState("");
  const [activeIndex, setActiveIndex] = useState(-1);
  const containerRef = useRef<HTMLDivElement>(null);
  const listRef = useRef<HTMLDivElement>(null);
  // Product names are always stored lowercase — same display convention as everywhere else product names render (stock-movem…
  // Rationale: docs/CLIENT_COMMENTS.md#line-components-stock-batch-transfer-product-picker-tsx-L56
  const capsClass = useUppercaseDisplayClass();

  const selected = products.find((p) => p.id === productId) ?? null;

  // Shows the selected product's name while closed/not being typed into; reverts to it (or blank) on close without a pick, s…
  // Rationale: docs/CLIENT_COMMENTS.md#line-components-stock-batch-transfer-product-picker-tsx-L63
  useEffect(() => {
    if (!open) setTerm(selected ? selected.name : "");
  }, [selected, open]);

  useEffect(() => setActiveIndex(-1), [term, open]);

  const { results } = useMemo(() => searchProducts(term, products), [term, products]);
  const filtered = results.slice(0, 50);

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (containerRef.current?.contains(event.target as Node)) return;
      setOpen(false);
    };
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  // Per-instance ids: the input keeps DOM focus and names the highlighted
  // row through aria-activedescendant.
  const listboxId = useId();
  const rowId = (index: number) => `${listboxId}-row-${index}`;

  // The input holds focus, so nothing scrolls the list on its own.
  useEffect(() => {
    if (!open || activeIndex < 0) return;
    listRef.current
      ?.querySelector<HTMLElement>(`#${CSS.escape(rowId(activeIndex))}`)
      ?.scrollIntoView({ block: "nearest" });
    // rowId derives from listboxId, stable for this instance.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeIndex, open]);

  const commit = (product: TransferableProductRow | null) => {
    onSelect(product ? product.id : "");
    setTerm(product ? product.name : "");
    setOpen(false);
  };

  return (
    <div className="relative w-full" ref={containerRef}>
      <Input
        role="combobox"
        aria-expanded={open}
        aria-controls={open ? listboxId : undefined}
        aria-autocomplete="list"
        aria-activedescendant={
          open && activeIndex >= 0 ? rowId(activeIndex) : undefined
        }
        value={term}
        disabled={disabled}
        autoComplete="off"
        onChange={(e) => {
          setTerm(e.target.value);
          setOpen(true);
          if (productId) onSelect("");
        }}
        onFocus={() => setOpen(true)}
        onKeyDown={(e) => {
          if (e.key === "Escape") {
            setOpen(false);
          } else if (e.key === "ArrowDown") {
            e.preventDefault();
            if (!open) setOpen(true);
            setActiveIndex((prev) => Math.min(prev + 1, filtered.length - 1));
          } else if (e.key === "ArrowUp") {
            e.preventDefault();
            if (!open) setOpen(true);
            setActiveIndex((prev) => Math.max(prev - 1, 0));
          } else if (e.key === "Home" && open) {
            e.preventDefault();
            setActiveIndex(0);
          } else if (e.key === "End" && open) {
            e.preventDefault();
            setActiveIndex(filtered.length - 1);
          } else if (e.key === "Tab") {
            setOpen(false);
          } else if (e.key === "Enter" && open) {
            e.preventDefault();
            if (activeIndex >= 0 && activeIndex < filtered.length) {
              commit(filtered[activeIndex]);
            }
          }
        }}
        placeholder={placeholder}
        // Only cased while showing the committed selection, not while the
        // user is actively typing a search term — matches
        // request-item-dialog.tsx's product-name field, which leaves live
        // typed text untouched and only cases the read-only display bits.
        className={cn("w-full", !open && capsClass)}
      />
      {open && (
        <div className="absolute z-[999] w-full mt-1 bg-popover text-popover-foreground shadow-xl rounded-md border border-border outline-none animate-in fade-in-0 zoom-in-95 overflow-hidden">
          <div
            ref={listRef}
            id={listboxId}
            role="listbox"
            aria-label={placeholder || "Products"}
            className="max-h-60 overflow-y-auto stable-scrollbar p-1"
          >
            {filtered.length === 0 && (
              <div className="px-2 py-2 text-sm text-muted-foreground">
                {loading ? "Loading products..." : emptyText}
              </div>
            )}
            {filtered.map((product, idx) => (
              <div
                key={product.id}
                id={rowId(idx)}
                role="option"
                aria-selected={product.id === productId}
                onMouseDown={(e) => e.preventDefault()}
                onClick={() => commit(product)}
                className={cn(
                  "flex items-center justify-between gap-2 cursor-pointer select-none rounded-sm px-2 py-1.5 text-sm outline-none hover:bg-accent hover:text-accent-foreground",
                  idx === activeIndex && "bg-accent text-accent-foreground",
                )}
              >
                <span className={cn("truncate", capsClass)}>{product.name}</span>
                <span className="shrink-0 text-xs text-muted-foreground">
                  {showQuantities
                    ? `${product.available_quantity} ${product.base_unit || "unit"}`
                    : product.available_quantity > 0 ? "Available" : "Not available"}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
