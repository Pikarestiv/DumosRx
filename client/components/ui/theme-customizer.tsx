"use client"

import * as React from "react"
import { Palette, Settings } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle, SheetTrigger } from "@/components/ui/sheet"
import { Label } from "@/components/ui/label"
import { Slider } from "@/components/ui/slider"

const colorThemes = [
  { name: "Professional", primary: "#1f2937", accent: "#8b5cf6" },
  { name: "Medical Blue", primary: "#1e40af", accent: "#3b82f6" },
  { name: "Forest Green", primary: "#166534", accent: "#22c55e" },
  { name: "Warm Orange", primary: "#ea580c", accent: "#f97316" },
  { name: "Deep Purple", primary: "#7c3aed", accent: "#a855f7" },
]

export function ThemeCustomizer() {
  const [borderRadius, setBorderRadius] = React.useState([8])
  const [selectedTheme, setSelectedTheme] = React.useState(0)

  const applyTheme = (themeIndex: number) => {
    const theme = colorThemes[themeIndex]
    const root = document.documentElement

    // Convert hex to oklch (simplified - in production you'd use a proper converter)
    root.style.setProperty("--primary", theme.primary)
    root.style.setProperty("--accent", theme.accent)

    setSelectedTheme(themeIndex)
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
          <SheetDescription>Customize the appearance of your pharmacy management system</SheetDescription>
        </SheetHeader>

        <div className="space-y-6 py-6">
          {/* Color Themes */}
          <div className="space-y-3">
            <Label className="text-sm font-medium">Color Themes</Label>
            <div className="grid grid-cols-1 gap-2">
              {colorThemes.map((theme, index) => (
                <button
                  key={theme.name}
                  onClick={() => applyTheme(index)}
                  className={`flex items-center justify-between p-3 rounded-lg border transition-colors ${
                    selectedTheme === index ? "border-primary bg-primary/5" : "border-border hover:bg-muted/50"
                  }`}
                >
                  <div className="flex items-center gap-3">
                    <div className="flex gap-1">
                      <div className="w-4 h-4 rounded-full border" style={{ backgroundColor: theme.primary }} />
                      <div className="w-4 h-4 rounded-full border" style={{ backgroundColor: theme.accent }} />
                    </div>
                    <span className="text-sm font-medium">{theme.name}</span>
                  </div>
                  {selectedTheme === index && <span className="text-xs text-primary">✓</span>}
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
