"use client"

import * as React from "react"
import { Palette, Settings2 } from "lucide-react"
import { Button } from "@/components/ui/button"
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from "@/components/ui/sheet"
import { Label } from "@/components/ui/label"

const colorThemes = [
  { id: "default", name: "Dumos Blue", primary: "#2563eb", accent: "#3b82f6" },
  { id: "ocean", name: "Ocean Breeze", primary: "#0891b2", accent: "#06b6d4" },
  { id: "emerald", name: "Emerald Health", primary: "#10b981", accent: "#34d399" },
  { id: "ruby", name: "Ruby Retail", primary: "#e11d48", accent: "#fb7185" },
  { id: "midnight", name: "Midnight Gold", primary: "#1e293b", accent: "#f59e0b" },
  { id: "slate", name: "Professional Slate", primary: "#475569", accent: "#94a3b8" },
]

export function ThemeCustomizer() {
  const [activeThemeId, setActiveThemeId] = React.useState("default")

  React.useEffect(() => {
    const savedTheme = localStorage.getItem("drx_brand_theme") || "default"
    setActiveThemeId(savedTheme)
    applyThemeClass(savedTheme)
  }, [])

  const applyThemeClass = (themeId: string) => {
    if (typeof document !== "undefined") {
      const root = document.documentElement
      const classes = Array.from(root.classList).filter(c => c.startsWith('theme-'))
      classes.forEach(c => root.classList.remove(c))
      
      if (themeId !== 'default') {
        root.classList.add(`theme-${themeId}`)
      }
    }
  }

  const setTheme = (themeId: string) => {
    setActiveThemeId(themeId)
    localStorage.setItem("drx_brand_theme", themeId)
    applyThemeClass(themeId)
  }

  return (
    <Sheet>
      <SheetTrigger asChild>
        <Button variant="ghost" size="icon" className="relative group">
          <Palette className="h-5 w-5 transition-transform group-hover:rotate-12" />
        </Button>
      </SheetTrigger>
      <SheetContent>
        <SheetHeader>
          <SheetTitle>Brand Customizer</SheetTitle>
          <SheetDescription>
            Personalize your cloud dashboard branding.
          </SheetDescription>
        </SheetHeader>
        <div className="py-6 space-y-6">
          <div className="space-y-3">
            <Label className="text-sm font-medium text-muted-foreground flex items-center gap-2">
              <Settings2 className="w-4 h-4" />
              COLOR PALETTE
            </Label>
            <div className="grid grid-cols-1 gap-2">
              {colorThemes.map((theme) => (
                <button
                  key={theme.id}
                  onClick={() => setTheme(theme.id)}
                  className={`flex items-center justify-between p-3 rounded-xl border transition-all ${
                    activeThemeId === theme.id 
                      ? "border-primary bg-primary/5 shadow-sm" 
                      : "border-border hover:bg-muted/50"
                  }`}
                >
                  <div className="flex items-center gap-3">
                    <div className="flex -space-x-1">
                      <div className="w-5 h-5 rounded-full border-2 border-background shadow-sm" style={{ backgroundColor: theme.primary }} />
                      <div className="w-5 h-5 rounded-full border-2 border-background shadow-sm" style={{ backgroundColor: theme.accent }} />
                    </div>
                    <span className="text-sm font-bold">{theme.name}</span>
                  </div>
                  {activeThemeId === theme.id && (
                    <div className="w-5 h-5 rounded-full bg-primary flex items-center justify-center">
                      <div className="w-2 h-2 rounded-full bg-primary-foreground" />
                    </div>
                  )}
                </button>
              ))}
            </div>
          </div>
        </div>
      </SheetContent>
    </Sheet>
  )
}
