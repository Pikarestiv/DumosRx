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

interface SearchableInputProps extends React.InputHTMLAttributes<HTMLInputElement> {
  options: string[]
  onValueChange: (value: string) => void
}

export function SearchableInput({ options, value, onValueChange, className, ...props }: SearchableInputProps) {
  const [open, setOpen] = React.useState(false)
  const [inputValue, setInputValue] = React.useState(value as string || "")
  const containerRef = React.useRef<HTMLDivElement>(null)

  React.useEffect(() => {
    setInputValue(value as string || "")
  }, [value])

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

  const filteredOptions = options.filter((option) =>
    option.toLowerCase().includes(inputValue.toLowerCase())
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
          if (e.key === "Escape") setOpen(false)
        }}
        className={cn("w-full", className)}
      />
      {open && filteredOptions.length > 0 && (
        <div className="absolute z-50 w-full mt-1 bg-popover text-popover-foreground shadow-md rounded-md border outline-none animate-in fade-in-0 zoom-in-95">
          <Command shouldFilter={false} className="bg-transparent">
            <CommandList className="max-h-40 overflow-y-auto p-1">
              <CommandGroup>
                {filteredOptions.map((option) => (
                  <CommandItem
                    key={option}
                    value={option}
                    onSelect={(currentValue) => {
                      setInputValue(currentValue)
                      onValueChange(currentValue)
                      setOpen(false)
                    }}
                    className="cursor-pointer hover:bg-accent hover:text-accent-foreground px-2 py-1.5 rounded-sm text-sm"
                  >
                    {option}
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
