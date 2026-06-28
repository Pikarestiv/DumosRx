"use client"
import React from "react"
import { Moon, Sun, Monitor } from "lucide-react"
import { useTheme } from "@/components/theme-provider"
import { Button } from "@/components/ui/button"
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu"
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip"
import { useFeatureGate } from "@/lib/hooks/use-feature-gate"

export function ThemeToggle() {
  const { setTheme, theme } = useTheme()
  const { canUseDarkMode, withRestriction } = useFeatureGate()
  const [open, setOpen] = React.useState(false);
  const clickTimeout = React.useRef<NodeJS.Timeout | null>(null);

  const handleSetTheme = (newTheme: "light" | "dark" | "system") => {
    setTheme(newTheme)
    setOpen(false)
  }

  const handleDoubleClick = () => {
    if (theme === "dark") {
      withRestriction(() => handleSetTheme("light"))()
    } else {
      withRestriction(() => handleSetTheme("dark"), { featureAllowed: canUseDarkMode, featureKey: 'dark_mode' })()
    }
  }

  const handleInteraction = (e: React.MouseEvent | React.PointerEvent) => {
    e.preventDefault();
    if (clickTimeout.current) {
      clearTimeout(clickTimeout.current);
      clickTimeout.current = null;
      handleDoubleClick();
    } else {
      clickTimeout.current = setTimeout(() => {
        setOpen(prev => !prev);
        clickTimeout.current = null;
      }, 250);
    }
  }

  return (
    <DropdownMenu open={open} onOpenChange={setOpen}>
      <Tooltip>
        <TooltipTrigger asChild>
          <DropdownMenuTrigger asChild>
            <Button 
              id="tour-theme-toggle" 
              variant="outline" 
              size="icon" 
              className="h-9 w-9 bg-transparent"
              onClick={handleInteraction}
              onPointerDown={(e) => e.preventDefault()}
            >
              <Sun className="h-4 w-4 rotate-0 scale-100 transition-all dark:-rotate-90 dark:scale-0" />
              <Moon className="absolute h-4 w-4 rotate-90 scale-0 transition-all dark:rotate-0 dark:scale-100" />
              <span className="sr-only">Toggle theme</span>
            </Button>
          </DropdownMenuTrigger>
        </TooltipTrigger>
        <TooltipContent side="bottom" className="font-semibold text-xs mt-1">
          Toggle theme
        </TooltipContent>
      </Tooltip>
      <DropdownMenuContent align="end">
        <DropdownMenuItem onClick={withRestriction(() => handleSetTheme("light"))} className="cursor-pointer">
          <Sun className="mr-2 h-4 w-4" />
          <span>Light</span>
          {theme === "light" && <span className="ml-auto text-xs">✓</span>}
        </DropdownMenuItem>
        <DropdownMenuItem onClick={withRestriction(() => handleSetTheme("dark"), { featureAllowed: canUseDarkMode, featureKey: 'dark_mode' })} className="cursor-pointer">
          <Moon className="mr-2 h-4 w-4" />
          <span>Dark</span>
          {theme === "dark" && <span className="ml-auto text-xs">✓</span>}
        </DropdownMenuItem>
        <DropdownMenuItem onClick={withRestriction(() => handleSetTheme("system"), { featureAllowed: canUseDarkMode, featureKey: 'dark_mode' })} className="cursor-pointer">
          <Monitor className="mr-2 h-4 w-4" />
          <span>System</span>
          {theme === "system" && <span className="ml-auto text-xs">✓</span>}
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  )
}
