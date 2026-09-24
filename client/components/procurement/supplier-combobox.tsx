"use client";

import * as React from "react";
import { Check, Plus, X } from "lucide-react";
import { cn } from "@/lib/utils";
import { Input } from "@/components/ui/input";
import { genericFuzzySearch } from "@/lib/utils/search";

interface Supplier {
  id: string;
  name: string;
}

interface SupplierComboboxProps {
  /** Selected supplier id, or the SELF_PURCHASE_VENDOR_ID sentinel, or ""
   * when nothing has been chosen yet. */
  value: string;
  suppliers: Supplier[];
  onChange: (id: string) => void;
  onCreateNew: () => void;
  selfPurchaseId: string;
  placeholder?: string;
  className?: string;
}

/** Search-to-filter vendor picker, built on the same interaction pattern as
 * ProductCombobox: type to fuzzy-filter, click/scroll to pick, with
 * "Create Supplier" pinned at the top so it's never buried by a long
 * supplier list. Kept to the same column width as the fields around it —
 * a search input needs typing room, not extra column width. */
export function SupplierCombobox({
  value,
  suppliers,
  onChange,
  onCreateNew,
  selfPurchaseId,
  placeholder = "Search or select a vendor...",
  className,
}: SupplierComboboxProps) {
  const [open, setOpen] = React.useState(false);
  const [searchText, setSearchText] = React.useState("");
  const [activeIndex, setActiveIndex] = React.useState(-1);
  const containerRef = React.useRef<HTMLDivElement>(null);
  const listRef = React.useRef<HTMLDivElement>(null);
  // Per-instance ids so the input (which keeps DOM focus) can name the
  // highlighted row through aria-activedescendant.
  const listboxId = React.useId();
  const rowId = (index: number) => `${listboxId}-row-${index}`;

  const selectedLabel = React.useMemo(() => {
    if (value === selfPurchaseId) return "Self / Walk-in Purchase";
    return suppliers.find((s) => s.id === value)?.name || "";
  }, [value, suppliers, selfPurchaseId]);

  // Shown while the dropdown is closed; while open, the user's own typing
  // (searchText) takes over so filtering isn't fighting the resolved label.
  const displayValue = open ? searchText : selectedLabel;

  const filteredSuppliers = React.useMemo(() => {
    if (!searchText) return suppliers;
    return genericFuzzySearch(searchText, suppliers, ["name"]).results;
  }, [searchText, suppliers]);

  React.useEffect(() => {
    setActiveIndex(-1);
  }, [searchText, open]);

  React.useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (
        containerRef.current &&
        !containerRef.current.contains(event.target as Node)
      ) {
        setOpen(false);
        setSearchText("");
      }
    };
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  const selectSupplier = (id: string) => {
    onChange(id);
    setSearchText("");
    setOpen(false);
  };

  const createSupplier = () => {
    onCreateNew();
    setOpen(false);
    setSearchText("");
  };

  // One flat list so arrow keys reach the "Create Supplier" and
  // "Self / Walk-in Purchase" rows too - previously only the fuzzy-matched
  // suppliers were reachable from the keyboard, and the two pinned rows were
  // mouse-only.
  const rows: Array<
    { kind: "create" } | { kind: "self" } | { kind: "supplier"; id: string }
  > = [
    { kind: "create" },
    { kind: "self" },
    ...filteredSuppliers.map((s) => ({ kind: "supplier" as const, id: s.id })),
  ];

  const activateRow = (index: number) => {
    const row = rows[index];
    if (!row) return;
    if (row.kind === "create") createSupplier();
    else if (row.kind === "self") selectSupplier(selfPurchaseId);
    else selectSupplier(row.id);
  };

  // The input holds focus, so the list never scrolls itself.
  React.useEffect(() => {
    if (!open || activeIndex < 0) return;
    listRef.current
      ?.querySelector<HTMLElement>(`#${CSS.escape(rowId(activeIndex))}`)
      ?.scrollIntoView({ block: "nearest" });
    // rowId derives from listboxId, stable for this instance.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeIndex, open]);

  return (
    <div className="relative w-full" ref={containerRef}>
      <div className="relative">
        <Input
          role="combobox"
          aria-expanded={open}
          aria-controls={open ? listboxId : undefined}
          aria-autocomplete="list"
          aria-activedescendant={
            open && activeIndex >= 0 ? rowId(activeIndex) : undefined
          }
          value={displayValue}
          onChange={(e) => {
            setSearchText(e.target.value);
            setOpen(true);
          }}
          onFocus={(e) => {
            setOpen(true);
            e.target.select();
          }}
          onKeyDown={(e) => {
            if (e.key === "Escape") {
              setOpen(false);
              setSearchText("");
            } else if (e.key === "ArrowDown") {
              e.preventDefault();
              if (!open) setOpen(true);
              setActiveIndex((prev) => Math.min(prev + 1, rows.length - 1));
            } else if (e.key === "ArrowUp") {
              e.preventDefault();
              if (!open) setOpen(true);
              setActiveIndex((prev) => Math.max(prev - 1, 0));
            } else if (e.key === "Home" && open) {
              e.preventDefault();
              setActiveIndex(0);
            } else if (e.key === "End" && open) {
              e.preventDefault();
              setActiveIndex(rows.length - 1);
            } else if (e.key === "Tab") {
              setOpen(false);
            } else if (e.key === "Enter") {
              if (open && activeIndex >= 0) {
                e.preventDefault();
                activateRow(activeIndex);
              }
            }
          }}
          placeholder={placeholder}
          autoComplete="off"
          className={cn("w-full", displayValue && "pr-8", className)}
        />
        {displayValue && (
          <button
            type="button"
            onClick={() => {
              onChange("");
              setSearchText("");
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
          <div
            ref={listRef}
            id={listboxId}
            role="listbox"
            aria-label={placeholder}
            className="max-h-[300px] overflow-y-auto p-1"
          >
            <div
              id={rowId(0)}
              role="option"
              aria-selected={activeIndex === 0}
              // onMouseDown + preventDefault so the input never blurs -
              // a blur would close the list before a click event landed.
              onMouseDown={(e) => {
                if (e.button !== 0) return;
                e.preventDefault();
                createSupplier();
              }}
              className={cn(
                "relative flex cursor-pointer select-none items-center gap-1.5 rounded-sm py-2 px-2 mb-1 text-sm font-semibold outline-none bg-primary/10 text-primary hover:bg-primary/15",
                activeIndex === 0 && "bg-primary/20",
              )}
            >
              <Plus className="h-4 w-4 shrink-0" />
              Create Supplier
            </div>

            <div
              id={rowId(1)}
              role="option"
              aria-selected={value === selfPurchaseId}
              onMouseDown={(e) => {
                if (e.button !== 0) return;
                e.preventDefault();
                selectSupplier(selfPurchaseId);
              }}
              className={cn(
                "relative flex cursor-pointer select-none items-center rounded-sm py-2 px-2 text-sm outline-none hover:bg-accent hover:text-accent-foreground",
                activeIndex === 1 && "bg-accent text-accent-foreground",
              )}
            >
              <Check
                className={cn(
                  "mr-2 h-4 w-4 shrink-0",
                  value === selfPurchaseId ? "opacity-100" : "opacity-0",
                )}
              />
              Self / Walk-in Purchase
            </div>

            {filteredSuppliers.map((supplier, idx) => (
              <div
                key={supplier.id}
                id={rowId(idx + 2)}
                role="option"
                aria-selected={value === supplier.id}
                onMouseDown={(e) => {
                  if (e.button !== 0) return;
                  e.preventDefault();
                  selectSupplier(supplier.id);
                }}
                className={cn(
                  "relative flex cursor-pointer select-none items-center rounded-sm py-2 px-2 text-sm outline-none hover:bg-accent hover:text-accent-foreground",
                  idx + 2 === activeIndex && "bg-accent text-accent-foreground",
                )}
              >
                <Check
                  className={cn(
                    "mr-2 h-4 w-4 shrink-0",
                    value === supplier.id ? "opacity-100" : "opacity-0",
                  )}
                />
                {supplier.name}
              </div>
            ))}
            {searchText && filteredSuppliers.length === 0 && (
              <div className="px-2 py-3 text-center text-[12.5px] text-muted-foreground">
                No suppliers match &quot;{searchText}&quot;
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
