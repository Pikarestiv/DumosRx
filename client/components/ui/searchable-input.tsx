"use client"

import * as React from "react"
import { cn } from "@/lib/utils"
import { Input } from "@/components/ui/input"
import {
  Command,
  CommandGroup,
  CommandItem,
  CommandList,
} from "@/components/ui/command"

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

  React.useEffect(() => {
    setInputValue(getLabelForValue(value))
  }, [value, options])

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
          // If the user clears the input, we might want to clear the value
          if (val === "") onValueChange("")
          setOpen(true)
        }}
        onFocus={() => setOpen(true)}
        onKeyDown={(e) => {
          if (e.key === "Escape") setOpen(false)
        }}
        className={cn("w-full", className)}
      />
      {open && filteredOptions.length > 0 && (
        <div className="absolute z-[999] w-full mt-1 bg-popover text-popover-foreground shadow-xl rounded-md border border-border outline-none animate-in fade-in-0 zoom-in-95 overflow-hidden">
          <Command shouldFilter={false} className="bg-transparent">
            <CommandList className="max-h-60 overflow-y-auto p-1">
              <CommandGroup>
                {filteredOptions.map((option) => (
                  <CommandItem
                    key={option.value}
                    value={option.value}
                    onSelect={() => {
                      setInputValue(option.label)
                      onValueChange(option.value)
                      setOpen(false)
                    }}
                    className="cursor-pointer hover:bg-accent hover:text-accent-foreground px-2 py-1.5 rounded-sm text-sm"
                  >
                    {option.label}
                  </CommandItem>
                ))}
              </CommandGroup>
            </CommandList>
          </Command>
        </div>
      )}
    </div>
  )
}
