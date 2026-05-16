"use client";

import { Sun, Moon, Globe, Save } from "lucide-react";
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
}

const colorThemes = [
  { id: "default", name: "Dumos Blue", color: "bg-blue-600" },
  { id: "ocean", name: "Ocean Breeze", color: "bg-cyan-500" },
  { id: "emerald", name: "Emerald Health", color: "bg-emerald-500" },
  { id: "ruby", name: "Ruby Retail", color: "bg-rose-600" },
  { id: "midnight", name: "Midnight Gold", color: "bg-slate-900" },
  { id: "slate", name: "Professional Slate", color: "bg-slate-500" },
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
}: AppearanceSettingsProps) {
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
                onClick={() => setTheme("light")}
                className={`flex flex-col items-center justify-center p-4 rounded-lg border-2 transition-all cursor-pointer ${
                  theme === "light"
                    ? "border-primary bg-primary/5"
                    : "border-muted hover:border-primary/50"
                }`}
              >
                <Sun className="h-6 w-6 mb-2" />
                <span className="text-sm font-medium">Light</span>
              </button>
              <button
                onClick={() => setTheme("dark")}
                className={`flex flex-col items-center justify-center p-4 rounded-lg border-2 transition-all cursor-pointer ${
                  theme === "dark"
                    ? "border-primary bg-primary/5"
                    : "border-muted hover:border-primary/50"
                }`}
              >
                <Moon className="h-6 w-6 mb-2" />
                <span className="text-sm font-medium">Dark</span>
              </button>
              <button
                onClick={() => setTheme("system")}
                className={`flex flex-col items-center justify-center p-4 rounded-lg border-2 transition-all cursor-pointer ${
                  theme === "system"
                    ? "border-primary bg-primary/5"
                    : "border-muted hover:border-primary/50"
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
              {colorThemes.map((t) => (
                <button
                  key={t.id}
                  onClick={() => setAppTheme(t.id)}
                  className={`flex items-center gap-3 p-4 rounded-lg border-2 transition-all cursor-pointer ${
                    activeTheme === t.id
                      ? "border-primary bg-primary/5"
                      : "border-border hover:bg-muted"
                  }`}
                >
                  <div
                    className={`w-6 h-6 rounded-full ${t.color} border shadow-sm`}
                  />
                  <span className="text-sm font-medium">{t.name}</span>
                </button>
              ))}
            </div>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Regional Settings</CardTitle>
          <CardDescription>
            Configure currency and locale defaults.
          </CardDescription>
        </CardHeader>
        <CardContent className="grid gap-6">
          <div className="grid gap-2">
            <Label htmlFor="currency">Currency Code (ISO)</Label>
            <Input
              id="currency"
              value={localCurrency}
              onChange={(e) =>
                setLocalCurrency(e.target.value.toUpperCase())
              }
              placeholder="e.g. NGN, USD, GHS"
            />
          </div>
          <div className="grid gap-2">
            <Label htmlFor="vat">VAT Percentage (%)</Label>
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
        <CardFooter className="border-t px-6 py-4">
          <Button onClick={handleSaveRegional}>
            <Save className="w-4 h-4 mr-2" />
            Save Regional Settings
          </Button>
        </CardFooter>
      </Card>
    </div>
  );
}
