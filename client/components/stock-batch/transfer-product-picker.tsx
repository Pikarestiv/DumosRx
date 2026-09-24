"use client";

import { useEffect, useId, useMemo, useRef, useState } from "react";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import { searchProducts } from "@/lib/utils/search";
import { useUppercaseDisplayClass } from "@/lib/hooks/use-uppercase-display";
import type { TransferableProductRow } from "@/lib/db/queries/stock-transfers";

/** The Transfer Stock dialog's product picker. Deliberately NOT a Radix
 * Popover (see components/ui/combobox.tsx) — a Radix Popover's cmdk search
 * input can't be focused/typed into when nested inside that dialog's Radix
 * Dialog (the Dialog's own focus trap wins the fight over the Popover's), a
 * known bad combination.
 *
 * Also deliberately NOT portaled to document.body (unlike
 * components/ui/searchable-input.tsx) — Radix's Dialog wraps itself in
 * react-remove-scroll, which intercepts every `wheel`/`touchmove` event at
 * the document level and only lets it through for elements it can prove are
 * genuine DOM descendants of the dialog's own content (or an explicit
 * `shard`); a portaled-to-body menu is neither, so its scroll gets silently
 * preventDefault()'d — the menu opens and filters but never scrolls. A
 * plain `absolute`-positioned div that stays a real DOM child of this
 * field (matching ProductCombobox's approach exactly, proven to work
 * inside this same ResponsiveModal in AddProductDialog) sidesteps that
 * entirely, since react-remove-scroll recognizes real descendants as
 * scrollable and lets their wheel events pass through.
 *
 * Uses searchProducts — the same function the POS product grid searches
 * with (use-pos-product-filter.ts) — instead of baking availability into a
 * fuzzy-matched label string. The caller keys this component by source
 * store id so its internal search text resets when the source store (and
 * so the product list) changes. */
export function TransferProductPicker({
  products,
  loading,
  disabled,
  productId,
  onSelect,
  placeholder,
  emptyText,
}: {
  products: TransferableProductRow[];
  loading: boolean;
  disabled: boolean;
  productId: string;
  onSelect: (id: string) => void;
  placeholder: string;
  emptyText: string;
}) {
  const [open, setOpen] = useState(false);
  const [term, setTerm] = useState("");
  const [activeIndex, setActiveIndex] = useState(-1);
  const containerRef = useRef<HTMLDivElement>(null);
  const listRef = useRef<HTMLDivElement>(null);
  // Product names are always stored lowercase — same display convention as
  // everywhere else product names render (stock-movement-desktop-row.tsx,
  // catalog-list.tsx, pos-product-list.tsx, ...).
  const capsClass = useUppercaseDisplayClass();

  const selected = products.find((p) => p.id === productId) ?? null;

  // Shows the selected product's name while closed/not being typed into;
  // reverts to it (or blank) on close without a pick, same as
  // SearchableInput's value<->inputValue sync.
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
            className="max-h-60 overflow-y-auto p-1"
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
                  {product.available_quantity} {product.base_unit || "unit"}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
