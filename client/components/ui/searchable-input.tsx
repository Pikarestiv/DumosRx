"use client"

import * as React from "react"
import { createPortal } from "react-dom"
import { cn } from "@/lib/utils"
import { Input } from "@/components/ui/input"

export interface SearchOption {
  label: string;
  value: string;
}

interface SearchableInputProps extends Omit<React.InputHTMLAttributes<HTMLInputElement>, 'value' | 'onChange'> {
  options: (string | SearchOption)[]
  value: string
  onValueChange: (value: string) => void
  /** Escape closes the suggestion dropdown either way; this additionally
   * signals "cancel the whole edit", for callers that treat this input as a
   * commit-on-blur editable cell rather than a plain filter field. */
  onEscapeKey?: () => void
  /** Fired with the definitive final value whenever Enter or a dropdown
   * click commits one — a caller reading `value`/onValueChange's own state
   * instead would see it a render behind here, since selecting an option
   * calls onValueChange and this in the same synchronous handler. */
  onCommitKey?: (value: string) => void
}

export function SearchableInput({ options, value, onValueChange, onEscapeKey, onCommitKey, className, ...props }: SearchableInputProps) {
  const [open, setOpen] = React.useState(false)

  // Find the label for the current value if it's an object
  const getLabelForValue = (val: string) => {
    const option = options.find(opt =>
      typeof opt === 'string' ? opt === val : opt.value === val
    );
    if (!option) return val;
    return typeof option === 'string' ? option : option.label;
  };

  const [inputValue, setInputValue] = React.useState(getLabelForValue(value))
  const containerRef = React.useRef<HTMLDivElement>(null)
  // The portaled menu (see below) lives outside containerRef's own DOM
  // subtree, so the click-outside check below needs its own ref to still
  // recognize a click on an option as "inside" instead of closing the menu
  // out from under it before the click can land.
  const menuRef = React.useRef<HTMLDivElement>(null)
  const [activeIndex, setActiveIndex] = React.useState(-1)
  // Rendered via a portal (see below) instead of a plain absolutely
  // positioned child, since every caller so far embeds this inside a
  // scrollable table/list (catalog-list.tsx's `overflow-y-auto` row
  // container): a CSS-absolute dropdown positioned relative to an ancestor
  // inside that container gets clipped by the container's own overflow
  // the moment it would extend past the visible scroll area, no matter how
  // high its z-index is — z-index can't override an ancestor's clipping.
  // Portaling to <body> with `position: fixed` coordinates computed from
  // the input's own bounding rect escapes every ancestor's overflow/stacking
  // context, the same way Radix's Popover/DropdownMenu do internally.
  const [menuRect, setMenuRect] = React.useState<{ top?: number; bottom?: number; left: number; width: number } | null>(null)

  React.useEffect(() => {
    setInputValue(getLabelForValue(value))
  }, [value, options])

  React.useEffect(() => {
    setActiveIndex(-1)
  }, [inputValue, open])

  const updateMenuRect = React.useCallback(() => {
    const el = containerRef.current
    if (!el) return
    const rect = el.getBoundingClientRect()
    // Flip above the input when there isn't roughly enough room below for
    // the menu (max-h-60 = 240px) — otherwise a row near the bottom of the
    // viewport (not just the table's own scroll area) pushes the menu
    // straight off the bottom of the screen.
    const spaceBelow = window.innerHeight - rect.bottom
    if (spaceBelow < 250) {
      setMenuRect({ bottom: window.innerHeight - rect.top + 4, left: rect.left, width: rect.width })
    } else {
      setMenuRect({ top: rect.bottom + 4, left: rect.left, width: rect.width })
    }
  }, [])

  React.useEffect(() => {
    if (!open) return
    updateMenuRect()
    // The table this lives in scrolls its own container, not the window, so
    // `scroll` needs the capture phase to see it (scroll events don't
    // bubble) — recompute the menu's position on every scroll/resize while
    // open rather than leaving it stranded over the old spot.
    window.addEventListener("scroll", updateMenuRect, true)
    window.addEventListener("resize", updateMenuRect)
    return () => {
      window.removeEventListener("scroll", updateMenuRect, true)
      window.removeEventListener("resize", updateMenuRect)
    }
  }, [open, updateMenuRect])

  // Handle clicks outside to close the menu
  React.useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      const target = event.target as Node
      if (containerRef.current?.contains(target)) return
      if (menuRef.current?.contains(target)) return
      setOpen(false)
    }
    document.addEventListener("mousedown", handleClickOutside)
    return () => document.removeEventListener("mousedown", handleClickOutside)
  }, [])

  const normalizedOptions: SearchOption[] = options.map(opt =>
    typeof opt === 'string' ? { label: opt, value: opt } : opt
  );

  const filteredOptions = normalizedOptions.filter((option) =>
    option.label.toLowerCase().includes(inputValue.toLowerCase()) ||
    option.value.toLowerCase().includes(inputValue.toLowerCase())
  )

  const showMenu = open && filteredOptions.length > 0 && menuRect

  return (
    <div className="relative w-full" ref={containerRef}>
      <Input
        {...props}
        value={inputValue}
        autoComplete="off"
        onChange={(e) => {
          const val = e.target.value
          setInputValue(val)
          onValueChange(val)
          setOpen(true)
        }}
        onFocus={() => setOpen(true)}
        onKeyDown={(e) => {
          if (e.key === "Escape") {
            setOpen(false)
            onEscapeKey?.()
          } else if (e.key === "ArrowDown") {
            e.preventDefault()
            if (!open) setOpen(true)
            setActiveIndex((prev) => Math.min(prev + 1, filteredOptions.length - 1))
          } else if (e.key === "ArrowUp") {
            e.preventDefault()
            setActiveIndex((prev) => Math.max(prev - 1, 0))
          } else if (e.key === "Enter") {
            if (open) {
              e.preventDefault()
              if (activeIndex >= 0 && activeIndex < filteredOptions.length) {
                const selected = filteredOptions[activeIndex]
                setInputValue(selected.label)
                onValueChange(selected.value)
                setOpen(false)
                onCommitKey?.(selected.value)
                return
              }
              setOpen(false)
            }
            onCommitKey?.(inputValue)
          }
        }}
        className={cn("w-full", className)}
      />
      {showMenu && typeof document !== "undefined" && createPortal(
        <div
          ref={menuRef}
          className="fixed z-[999] min-w-[180px] w-max max-w-xs bg-popover text-popover-foreground shadow-xl rounded-md border border-border outline-none animate-in fade-in-0 zoom-in-95 overflow-hidden"
          style={{
            top: menuRect.top,
            bottom: menuRect.bottom,
            left: menuRect.left,
            minWidth: menuRect.width,
          }}
        >
          <div className="max-h-60 overflow-y-auto p-1">
            {filteredOptions.map((option, index) => (
              <div
                key={`${option.value}-${index}`}
                onMouseDown={(e) => e.preventDefault()}
                onClick={() => {
                  setInputValue(option.label)
                  onValueChange(option.value)
                  setOpen(false)
                  onCommitKey?.(option.value)
                }}
                className={cn(
                  "relative flex cursor-pointer select-none items-center rounded-sm px-2 py-1.5 text-sm outline-none hover:bg-accent hover:text-accent-foreground",
                  index === activeIndex && "bg-accent text-accent-foreground"
                )}
              >
                {option.label}
              </div>
            ))}
          </div>
        </div>,
        document.body
      )}
    </div>
  )
}
