"use client"

import * as React from "react"
import { Palette, Settings } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle, SheetTrigger } from "@/components/ui/sheet"
import { Label } from "@/components/ui/label"
import { Slider } from "@/components/ui/slider"
import { useStore } from "@/lib/context/store-context"

const colorThemes = [
  { id: "default", name: "Dumos Blue", primary: "#2563eb", accent: "#3b82f6" },
  { id: "ocean", name: "Ocean Breeze", primary: "#0891b2", accent: "#06b6d4" },
  { id: "emerald", name: "Emerald Health", primary: "#10b981", accent: "#34d399" },
  { id: "ruby", name: "Ruby Retail", primary: "#e11d48", accent: "#fb7185" },
  { id: "midnight", name: "Midnight Gold", primary: "#1e293b", accent: "#f59e0b" },
  { id: "slate", name: "Professional Slate", primary: "#475569", accent: "#94a3b8" },
]

export function ThemeCustomizer() {
  const { t, theme: activeThemeId, setTheme } = useStore()
  const [borderRadius, setBorderRadius] = React.useState([8])

  const applyTheme = (themeId: string) => {
    setTheme(themeId)
  }

  const applyBorderRadius = (value: number[]) => {
    const root = document.documentElement
    root.style.setProperty("--radius", `${value[0]}px`)
    setBorderRadius(value)
  }

  return (
    <Sheet>
      <SheetTrigger asChild>
        <Button variant="outline" size="icon" className="h-9 w-9 bg-transparent">
          <Palette className="h-4 w-4" />
          <span className="sr-only">Customize theme</span>
        </Button>
      </SheetTrigger>
      <SheetContent className="w-80">
        <SheetHeader>
          <SheetTitle className="flex items-center gap-2">
            <Settings className="h-5 w-5" />
            Theme Customization
          </SheetTitle>
          <SheetDescription>Customize the appearance of your {t('store').toLowerCase()} management system</SheetDescription>
        </SheetHeader>

        <div className="space-y-6 py-6">
          {/* Color Themes */}
          <div className="space-y-3">
            <Label className="text-sm font-medium">Color Themes</Label>
            <div className="grid grid-cols-1 gap-2">
              {colorThemes.map((theme) => (
                <button
                  key={theme.id}
                  onClick={() => applyTheme(theme.id)}
                  className={`flex items-center justify-between p-3 rounded-lg border transition-colors ${
                    activeThemeId === theme.id ? "border-primary bg-primary/5" : "border-border hover:bg-muted/50"
                  }`}
                >
                  <div className="flex items-center gap-3">
                    <div className="flex gap-1">
                      <div className="w-4 h-4 rounded-full border" style={{ backgroundColor: theme.primary }} />
                      <div className="w-4 h-4 rounded-full border" style={{ backgroundColor: theme.accent }} />
                    </div>
                    <span className="text-sm font-medium">{theme.name}</span>
                  </div>
                  {activeThemeId === theme.id && <span className="text-xs text-primary">✓</span>}
                </button>
              ))}
            </div>
          </div>

          {/* Border Radius */}
          <div className="space-y-3">
            <Label className="text-sm font-medium">Border Radius</Label>
            <div className="space-y-2">
              <Slider
                value={borderRadius}
                onValueChange={applyBorderRadius}
                max={20}
                min={0}
                step={1}
                className="w-full"
              />
              <div className="flex justify-between text-xs text-muted-foreground">
                <span>Sharp (0px)</span>
                <span>Current: {borderRadius[0]}px</span>
                <span>Rounded (20px)</span>
              </div>
            </div>
          </div>

          {/* Preview Card */}
          <div className="space-y-3">
            <Label className="text-sm font-medium">Preview</Label>
            <div className="p-4 border rounded-lg bg-card">
              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <h4 className="font-medium">Sample Card</h4>
                  <Button size="sm">Action</Button>
                </div>
                <p className="text-sm text-muted-foreground">
                  This is how your interface will look with the selected theme.
                </p>
                <div className="flex gap-2">
                  <Button variant="outline" size="sm">
                    Secondary
                  </Button>
                  <Button variant="destructive" size="sm">
                    Delete
                  </Button>
                </div>
              </div>
            </div>
          </div>
        </div>
      </SheetContent>
    </Sheet>
  )
}
