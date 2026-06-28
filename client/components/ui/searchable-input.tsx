"use client"

import * as React from "react"
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
}

export function SearchableInput({ options, value, onValueChange, className, ...props }: SearchableInputProps) {
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
  const [activeIndex, setActiveIndex] = React.useState(-1)

  React.useEffect(() => {
    setInputValue(getLabelForValue(value))
  }, [value, options])

  React.useEffect(() => {
    setActiveIndex(-1)
  }, [inputValue, open])

  // Handle clicks outside to close the menu
  React.useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(event.target as Node)) {
        setOpen(false)
      }
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
              }
              setOpen(false)
            }
          }
        }}
        className={cn("w-full", className)}
      />
      {open && filteredOptions.length > 0 && (
        <div className="absolute z-[999] w-full mt-1 bg-popover text-popover-foreground shadow-xl rounded-md border border-border outline-none animate-in fade-in-0 zoom-in-95 overflow-hidden">
          <div className="max-h-60 overflow-y-auto p-1">
            {filteredOptions.map((option, index) => (
              <div
                key={option.value}
                onClick={() => {
                  setInputValue(option.label)
                  onValueChange(option.value)
                  setOpen(false)
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
        </div>
      )}
    </div>
  )
}
