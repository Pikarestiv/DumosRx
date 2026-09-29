"use client";

import * as React from "react";
import { Check, Plus } from "lucide-react";
import { useQuery } from "@tanstack/react-query";

import { cn } from "@/lib/utils";
import { Input } from "@/components/ui/input";
import { getCategoryList } from "@/lib/db/queries/categories";
import { queryKeys } from "@/lib/query-keys";

interface CategoryComboboxProps {
  value: string;
  onValueChange: (value: string) => void;
  placeholder?: string;
  id?: string;
  disabled?: boolean;
  className?: string;
}

/**
 * Category picker backed by the real `categories` table - and by nothing
 * else. FORM_SUGGESTIONS (lib/constants/suggestions.ts) is for naming a
 * brand-new category (settings/store/category-form-dialog.tsx), never for
 * choosing one, so this list stays empty on a fresh install rather than
 * substituting reference data a store does not actually use. The pinned
 * "Create ..." row is what keeps it open-ended (the save paths create a
 * missing category by name - see use-save-product-mutation.ts /
 * use-product-quick-edit-mutation.ts).
 *
 * Deliberately an in-DOM absolutely positioned dropdown rather than a
 * portal to <body> (the shape SearchableInput uses): every caller here sits
 * inside a Radix dialog, whose scroll-lock blocks wheel/touch scrolling over
 * a portaled sibling of the dialog content, so the list could not be
 * scrolled at all. See components/ui/product-combobox.tsx for the same
 * pattern.
 */
export function CategoryCombobox({
  value,
  onValueChange,
  placeholder = "Select or type category",
  id,
  disabled,
  className,
}: CategoryComboboxProps) {
  const [open, setOpen] = React.useState(false);
  const [activeIndex, setActiveIndex] = React.useState(-1);
  const containerRef = React.useRef<HTMLDivElement>(null);
  const listRef = React.useRef<HTMLDivElement>(null);
  const listboxId = React.useId();
  const optionId = (index: number) => `${listboxId}-opt-${index}`;

  const { data: categories } = useQuery({
    ...queryKeys.categories.list(),
    queryFn: () => getCategoryList(),
  });

  const names = React.useMemo(
    () => (categories ?? []).map((c) => c.name).filter(Boolean),
    [categories],
  );

  const filtered = React.useMemo(() => {
    const term = value.trim().toLowerCase();
    if (!term) return names;
    return names.filter((name) => name.toLowerCase().includes(term));
  }, [names, value]);

  const typed = value.trim();
  const showCreateRow =
    typed.length > 0 &&
    !names.some((name) => name.toLowerCase() === typed.toLowerCase());

  React.useEffect(() => {
    setActiveIndex(-1);
  }, [value, open]);

  React.useEffect(() => {
    if (!open) return;
    const activeOption = listRef.current?.querySelector<HTMLElement>(
      '[data-active="true"]',
    );
    activeOption?.scrollIntoView?.({ block: "nearest" });
  }, [activeIndex, open]);

  React.useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (!containerRef.current?.contains(event.target as Node)) {
        setOpen(false);
      }
    };
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  const commit = (next: string) => {
    onValueChange(next);
    setOpen(false);
  };

  const minIndex = showCreateRow ? -1 : 0;

  return (
    <div className="relative w-full" ref={containerRef}>
      <Input
        id={id}
        role="combobox"
        aria-expanded={open}
        aria-controls={open ? listboxId : undefined}
        aria-autocomplete="list"
        aria-activedescendant={
          open && activeIndex >= minIndex ? optionId(activeIndex) : undefined
        }
        value={value}
        disabled={disabled}
        autoComplete="off"
        placeholder={placeholder}
        className={cn("w-full", className)}
        onChange={(e) => {
          onValueChange(e.target.value);
          setOpen(true);
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
            setActiveIndex((prev) => Math.max(prev - 1, minIndex));
          } else if (e.key === "Home" && open) {
            e.preventDefault();
            setActiveIndex(minIndex);
          } else if (e.key === "End" && open) {
            e.preventDefault();
            setActiveIndex(filtered.length - 1);
          } else if (e.key === "Tab") {
            setOpen(false);
          } else if (e.key === "Enter" && open) {
            e.preventDefault();
            if (activeIndex >= 0 && activeIndex < filtered.length) {
              commit(filtered[activeIndex]);
            } else {
              setOpen(false);
            }
          }
        }}
      />

      {open && (showCreateRow || filtered.length > 0 || names.length === 0) && (
        <div className="absolute z-[999] w-full mt-1 bg-popover text-popover-foreground shadow-xl rounded-md border border-border outline-none animate-in fade-in-0 zoom-in-95 overflow-hidden">
          <div
            ref={listRef}
            id={listboxId}
            role="listbox"
            aria-label="Categories"
            className="max-h-60 overflow-y-auto overscroll-contain stable-scrollbar p-1"
          >
            {showCreateRow && (
              <div
                id={optionId(-1)}
                role="option"
                aria-selected={activeIndex === -1}
                data-active={activeIndex === -1}
                onMouseDown={(e) => e.preventDefault()}
                onClick={() => commit(typed)}
                className={cn(
                  "flex cursor-pointer select-none items-center gap-2 rounded-sm px-2 py-1.5 text-sm font-semibold bg-primary/10 text-primary",
                  activeIndex === -1 && "ring-1 ring-primary/40",
                )}
              >
                <Plus className="h-3.5 w-3.5 shrink-0" />
                <span className="truncate">Create &quot;{typed}&quot;</span>
              </div>
            )}
            {names.length === 0 && (
              <div className="px-2 py-1.5 text-xs text-muted-foreground">
                No categories yet - type a name to create your first one.
              </div>
            )}
            {filtered.map((name, index) => (
              <div
                key={`${name}-${index}`}
                id={optionId(index)}
                role="option"
                aria-selected={name.toLowerCase() === typed.toLowerCase()}
                data-active={index === activeIndex}
                onMouseDown={(e) => e.preventDefault()}
                onClick={() => commit(name)}
                className={cn(
                  "relative flex cursor-pointer select-none items-center justify-between gap-2 rounded-sm px-2 py-1.5 text-sm outline-none hover:bg-accent hover:text-accent-foreground",
                  index === activeIndex && "bg-accent text-accent-foreground",
                )}
              >
                <span className="truncate">{name}</span>
                {name.toLowerCase() === typed.toLowerCase() && (
                  <Check className="h-3.5 w-3.5 shrink-0 text-primary" />
                )}
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
