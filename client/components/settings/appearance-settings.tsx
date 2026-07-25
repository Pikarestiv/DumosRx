"use client";

import { useState } from "react";
import { Sun, Moon, Globe, Save, Lock, Info, Pencil, X, Banknote, Percent } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { APP_NAME } from "@/lib/constants";
import { Theme } from "@/components/theme-provider";
import { useFeatureGate } from "@/lib/hooks/use-feature-gate";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";

interface AppearanceSettingsProps {
  theme: string | undefined;
  setTheme: (theme: Theme) => void;
  activeTheme: string;
  setAppTheme: (theme: string) => void;
  localCurrency: string;
  setLocalCurrency: (val: string) => void;
  localVat: string;
  setLocalVat: (val: string) => void;
  handleSaveRegional: () => void;
  isAdmin: boolean;
}

const colorThemes = [
  {
    id: "default",
    name: "Dumos Blue",
    style: { backgroundColor: "oklch(0.55 0.18 250)" },
  },
  {
    id: "ocean",
    name: "Ocean Breeze",
    style: { backgroundColor: "oklch(0.588 0.158 241.966)" },
  },
  {
    id: "emerald",
    name: "Emerald Health",
    style: { backgroundColor: "oklch(0.627 0.194 149.214)" },
  },
  {
    id: "ruby",
    name: "Ruby Retail",
    style: { backgroundColor: "oklch(0.577 0.245 27.325)" },
  },
  {
    id: "midnight",
    name: "Midnight Gold",
    style: { backgroundColor: "oklch(0.696 0.151 77.212)" },
  },
  {
    id: "slate",
    name: "Professional Slate",
    style: { backgroundColor: "oklch(0.439 0 0)" },
  },
];

export function AppearanceSettings({
  theme,
  setTheme,
  activeTheme,
  setAppTheme,
  localCurrency,
  setLocalCurrency,
  localVat,
  setLocalVat,
  handleSaveRegional,
  isAdmin,
}: AppearanceSettingsProps) {
  const [isEditingRegional, setIsEditingRegional] = useState(false);

  const { canCustomizeTheme, canUseDarkMode, withRestriction } =
    useFeatureGate();

  const handleApplyTheme = (themeId: string) => {
    setAppTheme(themeId);
  };

  const handleSetTheme = (mode: Theme) => {
    setTheme(mode);
  };

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle>Appearance</CardTitle>
          <CardDescription>
            Customize how {APP_NAME} looks on this device.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
          <div className="space-y-3">
            <Label>Theme Mode</Label>
            <div className="grid grid-cols-3 gap-4">
              <button
                onClick={withRestriction(() => handleSetTheme("light"))}
                className={`flex flex-col items-center justify-center p-4 rounded-lg border-2 transition-all cursor-pointer ${
                  theme === "light"
                    ? "bg-primary text-primary-foreground border-primary"
                    : "border-muted hover:border-primary/50"
                }`}
              >
                <Sun className="h-6 w-6 mb-2" />
                <span className="text-sm font-medium">Light</span>
              </button>

              <button
                onClick={withRestriction(() => handleSetTheme("dark"), {
                  featureAllowed: canUseDarkMode,
                  featureKey: "dark_mode",
                })}
                className={`flex flex-col items-center justify-center p-4 rounded-lg border-2 transition-all cursor-pointer ${
                  theme === "dark"
                    ? "bg-primary text-primary-foreground border-primary"
                    : "border-border hover:border-primary/50"
                }`}
              >
                <Moon className="h-6 w-6 mb-2" />
                <span className="text-sm font-medium">Dark</span>
              </button>

              <button
                onClick={withRestriction(() => handleSetTheme("system"), {
                  featureAllowed: canUseDarkMode,
                  featureKey: "dark_mode",
                })}
                className={`flex flex-col items-center justify-center p-4 rounded-lg border-2 transition-all cursor-pointer ${
                  theme === "system"
                    ? "bg-primary text-primary-foreground border-primary"
                    : "border-border hover:border-primary/50"
                }`}
              >
                <Globe className="h-6 w-6 mb-2" />
                <span className="text-sm font-medium">System</span>
              </button>
            </div>
          </div>

          <div className="space-y-3">
            <Label>Color Themes</Label>
            <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
              {colorThemes.map((t) => {
                const isLocked = t.id !== "default" && !canCustomizeTheme;
                return (
                  <button
                    key={t.id}
                    onClick={
                      t.id === "default"
                        ? withRestriction(() => handleApplyTheme(t.id))
                        : withRestriction(() => handleApplyTheme(t.id), {
                            featureAllowed: canCustomizeTheme,
                            featureKey: "theme_customizer",
                          })
                    }
                    className={`flex items-center justify-between p-4 rounded-lg border-2 transition-all cursor-pointer ${
                      activeTheme === t.id
                        ? "bg-primary/5 border-primary text-primary shadow-sm"
                        : isLocked
                          ? "border-border opacity-60 cursor-not-allowed hover:bg-transparent"
                          : "border-border hover:bg-muted text-foreground"
                    }`}
                  >
                    <div className="flex items-center gap-3">
                      <div
                        className={`w-6 h-6 rounded-full border shadow-sm ${
                          activeTheme === t.id ? "ring-2 ring-primary ring-offset-1" : ""
                        }`}
                        // style={activeTheme === t.id ? undefined : t.style}
                        style={t.style}
                      />
                      <span className="text-sm font-medium">{t.name}</span>
                    </div>
                    {isLocked && (
                      <Lock className="h-4 w-4 text-muted-foreground" />
                    )}
                  </button>
                );
              })}
            </div>
          </div>
        </CardContent>
      </Card>

      {isAdmin && (
        <Card>
          <CardHeader className="flex flex-row items-start justify-between space-y-0 pb-4">
            <div className="space-y-1.5">
              <CardTitle>Regional Settings</CardTitle>
              <CardDescription>
                Configure currency and locale defaults.
              </CardDescription>
            </div>
            <Button
              variant="ghost"
              size="icon"
              onClick={() => setIsEditingRegional(!isEditingRegional)}
            >
              {!!(isEditingRegional) && (
                                          <X className="h-4 w-4" />
                                        )}
                          {!(isEditingRegional) && (
                                          <Pencil className="h-4 w-4" />
                                        )}
            </Button>
          </CardHeader>
          {!isEditingRegional && (
            <CardContent className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div className="flex items-center gap-3 rounded-lg border p-4 bg-muted/20">
                <div className="p-2 rounded-full bg-primary/10 shrink-0">
                  <Banknote className="h-4 w-4 text-primary" />
                </div>
                <div>
                  <p className="text-xs text-muted-foreground">Currency Code</p>
                  <p className="text-sm font-semibold">{localCurrency || "Not set"}</p>
                </div>
              </div>
              <div className="flex items-center gap-3 rounded-lg border p-4 bg-muted/20">
                <div className="p-2 rounded-full bg-primary/10 shrink-0">
                  <Percent className="h-4 w-4 text-primary" />
                </div>
                <div>
                  <p className="text-xs text-muted-foreground">VAT Percentage</p>
                  <p className="text-sm font-semibold">{localVat ? `${localVat}%` : "0%"}</p>
                </div>
              </div>
            </CardContent>
          )}
          {isEditingRegional && (
            <CardContent className="grid gap-6">
              <div className="grid gap-2">
                <div className="flex items-center gap-2">
                  <Label htmlFor="currency">Currency Code (ISO)</Label>
                  <TooltipProvider delayDuration={0}>
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <Info className="h-4 w-4 text-muted-foreground hover:text-foreground cursor-help" />
                      </TooltipTrigger>
                      <TooltipContent>
                        <p>
                          Enter a standard 3-letter currency code (e.g., NGN, USD,
                          GBP). This changes the currency symbol across the app.
                        </p>
                      </TooltipContent>
                    </Tooltip>
                  </TooltipProvider>
                </div>
                <Input
                  id="currency"
                  value={localCurrency}
                  onChange={(e) => setLocalCurrency(e.target.value.toUpperCase())}
                  placeholder="e.g. NGN, USD, GHS"
                />
              </div>
              <div className="grid gap-2">
                <div className="flex items-center gap-2">
                  <Label htmlFor="vat">VAT Percentage (%)</Label>
                  <TooltipProvider delayDuration={0}>
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <Info className="h-4 w-4 text-muted-foreground hover:text-foreground cursor-help" />
                      </TooltipTrigger>
                      <TooltipContent>
                        <p>
                          The default Value Added Tax applied to transactions.
                          Leave as 0 if your prices are already tax-inclusive.
                        </p>
                      </TooltipContent>
                    </Tooltip>
                  </TooltipProvider>
                </div>
                <Input
                  id="vat"
                  type="number"
                  step="0.1"
                  value={localVat}
                  onChange={(e) => setLocalVat(e.target.value)}
                  placeholder="e.g. 7.5"
                />
              </div>
            </CardContent>
          )}
          {isEditingRegional && (
            <CardFooter className="border-t px-6 py-4">
              <Button onClick={() => {
                handleSaveRegional();
                setIsEditingRegional(false);
              }}>
                <Save className="w-4 h-4 mr-2" />
                Save Regional Settings
              </Button>
            </CardFooter>
          )}
        </Card>
      )}
    </div>
  );
}
