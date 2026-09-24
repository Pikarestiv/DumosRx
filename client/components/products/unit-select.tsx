"use client";

import * as React from "react";
import { Plus } from "lucide-react";
import { cn } from "@/lib/utils";
import { Input } from "@/components/ui/input";
import { useStore } from "@/lib/context/store-context";
import { FORM_SUGGESTIONS } from "@/lib/constants/suggestions";

interface UnitSelectProps {
  id?: string;
  value: string;
  onValueChange: (value: string) => void;
  placeholder?: string;
}

// Dropdown-only unit picker (suggestions.ts's global list + this store's own
// custom units) with a one-click "add new" affordance right in the dropdown.
// Replaces free-text SearchableInput for units specifically so two products
// can't end up with "Tablet" vs "tablet" vs "Tabs" all meaning the same thing.
// Typing still filters the list; it just can never commit a value that isn't
// either an existing option or explicitly created via the "+ Add" row.
export function UnitSelect({ id, value, onValueChange, placeholder }: UnitSelectProps) {
  const { storeProfile, updateStoreProfile } = useStore();
  const [open, setOpen] = React.useState(false);
  const [filter, setFilter] = React.useState(value || "");
  const [activeIndex, setActiveIndex] = React.useState(-1);
  const containerRef = React.useRef<HTMLDivElement>(null);
  const listRef = React.useRef<HTMLDivElement>(null);
  // Per-instance ids so the input (which keeps focus) can point at the
  // highlighted row via aria-activedescendant.
  const listboxId = React.useId();
  const rowId = (index: number) => `${listboxId}-row-${index}`;

  const customUnits = React.useMemo<string[]>(() => {
    try {
      return storeProfile?.custom_units ? JSON.parse(storeProfile.custom_units) : [];
    } catch {
      return [];
    }
  }, [storeProfile?.custom_units]);

  const allOptions = React.useMemo(() => {
    const seen = new Set<string>();
    const merged: string[] = [];
    for (const unit of [...customUnits, ...FORM_SUGGESTIONS.common.units]) {
      const key = unit.toLowerCase();
      if (!seen.has(key)) {
        seen.add(key);
        merged.push(unit);
      }
    }
    return merged;
  }, [customUnits]);

  React.useEffect(() => {
    setFilter(value || "");
  }, [value]);

  React.useEffect(() => {
    setActiveIndex(-1);
  }, [filter, open]);

  React.useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(event.target as Node)) {
        setOpen(false);
        setFilter(value || "");
      }
    };
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, [value]);

  const filteredOptions = allOptions.filter((opt) =>
    opt.toLowerCase().includes(filter.toLowerCase())
  );

  const exactMatch = allOptions.some((opt) => opt.toLowerCase() === filter.trim().toLowerCase());
  const canCreate = filter.trim().length > 0 && !exactMatch;

  const selectOption = (unit: string) => {
    onValueChange(unit);
    setFilter(unit);
    setOpen(false);
  };

  const createAndSelect = async () => {
    const newUnit = filter.trim();
    if (!newUnit) return;
    const updated = [...customUnits, newUnit];
    await updateStoreProfile({ custom_units: JSON.stringify(updated) });
    selectOption(newUnit);
  };

  const rows: Array<{ type: "option"; value: string } | { type: "create" }> = [
    ...filteredOptions.map((opt) => ({ type: "option" as const, value: opt })),
    ...(canCreate ? [{ type: "create" as const }] : []),
  ];

  const listOpen = open && rows.length > 0;

  // Nothing else scrolls the list while the input holds focus.
  React.useEffect(() => {
    if (!listOpen || activeIndex < 0) return;
    listRef.current
      ?.querySelector<HTMLElement>(`#${CSS.escape(rowId(activeIndex))}`)
      ?.scrollIntoView({ block: "nearest" });
    // rowId derives from listboxId, stable for this instance.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeIndex, listOpen]);

  return (
    <div className="relative w-full" ref={containerRef}>
      <Input
        id={id}
        role="combobox"
        aria-expanded={listOpen}
        aria-controls={listOpen ? listboxId : undefined}
        aria-autocomplete="list"
        aria-activedescendant={
          listOpen && activeIndex >= 0 ? rowId(activeIndex) : undefined
        }
        value={filter}
        autoComplete="off"
        placeholder={placeholder}
        onChange={(e) => {
          setFilter(e.target.value);
          setOpen(true);
        }}
        onFocus={() => setOpen(true)}
        onKeyDown={(e) => {
          if (e.key === "Escape") {
            setOpen(false);
            setFilter(value || "");
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
            if (open) {
              e.preventDefault();
              const row = rows[activeIndex];
              if (row?.type === "option") {
                selectOption(row.value);
              } else if (row?.type === "create" || (activeIndex < 0 && canCreate && rows.length === 1)) {
                void createAndSelect();
              } else if (rows.length === 0) {
                // Nothing to select and nothing creatable (e.g. blank filter): revert.
                setOpen(false);
                setFilter(value || "");
              }
            }
          }
        }}
      />
      {listOpen && (
        <div className="absolute z-[999] w-full mt-1 bg-popover text-popover-foreground shadow-xl rounded-md border border-border outline-none overflow-hidden">
          <div
            ref={listRef}
            id={listboxId}
            role="listbox"
            aria-label={placeholder || "Unit"}
            className="max-h-60 overflow-y-auto p-1"
          >
            {filteredOptions.map((opt, index) => (
              <div
                key={opt}
                id={rowId(index)}
                role="option"
                aria-selected={opt === value}
                // onMouseDown + preventDefault so the input never blurs -
                // a blur would close the list before a click event landed.
                onMouseDown={(e) => {
                  if (e.button !== 0) return;
                  e.preventDefault();
                  selectOption(opt);
                }}
                className={cn(
                  "relative flex cursor-pointer select-none items-center rounded-sm px-2 py-1.5 text-sm outline-none hover:bg-accent hover:text-accent-foreground",
                  index === activeIndex && "bg-accent text-accent-foreground"
                )}
              >
                {opt}
              </div>
            ))}
            {canCreate && (
              <div
                id={rowId(filteredOptions.length)}
                role="option"
                aria-selected={activeIndex === filteredOptions.length}
                onMouseDown={(e) => {
                  if (e.button !== 0) return;
                  e.preventDefault();
                  void createAndSelect();
                }}
                className={cn(
                  "relative flex cursor-pointer select-none items-center gap-1.5 rounded-sm px-2 py-1.5 text-sm outline-none text-primary hover:bg-primary hover:text-primary-foreground",
                  activeIndex === filteredOptions.length && "bg-primary text-primary-foreground"
                )}
              >
                <Plus className="h-3.5 w-3.5" />
                Add &quot;{filter.trim()}&quot; as a new unit
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
