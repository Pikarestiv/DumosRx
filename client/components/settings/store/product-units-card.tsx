"use client";

import { useState } from "react";
import { Plus, X, Check, Ruler } from "lucide-react";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { useStore } from "@/lib/context/store-context";
import { FORM_SUGGESTIONS } from "@/lib/constants/suggestions";

/** Store-specific selling/pack units, layered on top of the built-in
 * suggestion list. Kept as a flat string list (custom_units) rather than a
 * structured {name, abbreviation} model — this store doesn't need per-unit
 * abbreviations/precision, just a name pickers can select from. */
export function ProductUnitsCard() {
  const { storeProfile, updateStoreProfile } = useStore();
  const [isAdding, setIsAdding] = useState(false);
  const [newUnit, setNewUnit] = useState("");

  let customUnits: string[] = [];
  try {
    customUnits = storeProfile?.custom_units
      ? JSON.parse(storeProfile.custom_units)
      : [];
  } catch {
    customUnits = [];
  }

  const saveUnits = (units: string[]) => {
    updateStoreProfile({ custom_units: JSON.stringify(units) });
  };

  const handleAdd = () => {
    const trimmed = newUnit.trim();
    if (!trimmed) return;
    const exists = [...FORM_SUGGESTIONS.common.units, ...customUnits].some(
      (u) => u.toLowerCase() === trimmed.toLowerCase(),
    );
    if (!exists) {
      saveUnits([...customUnits, trimmed]);
    }
    setNewUnit("");
    setIsAdding(false);
  };

  const handleRemove = (unit: string) => {
    saveUnits(customUnits.filter((u) => u !== unit));
  };

  return (
    <Card>
      <CardHeader className="flex flex-row items-start justify-between space-y-0 pb-4">
        <div className="space-y-1.5">
          <CardTitle>Product Units</CardTitle>
          <CardDescription>
            Add custom selling or pack units for your products, on top of the
            built-in list.
          </CardDescription>
        </div>
        <Button
          variant="ghost"
          size="icon"
          onClick={() => {
            setIsAdding(!isAdding);
            setNewUnit("");
          }}
        >
          {isAdding ? <X className="h-4 w-4" /> : <Plus className="h-4 w-4" />}
        </Button>
      </CardHeader>
      <CardContent className="space-y-6">
        {isAdding && (
          <div className="flex gap-2">
            <Input
              autoFocus
              placeholder="e.g. Carton, Roll, Sachet"
              value={newUnit}
              onChange={(e) => setNewUnit(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  e.preventDefault();
                  handleAdd();
                }
              }}
            />
            <Button onClick={handleAdd} disabled={!newUnit.trim()}>
              <Check className="h-4 w-4 mr-2" />
              Save
            </Button>
          </div>
        )}

        <div className="space-y-2">
          <p className="text-sm font-medium">Your custom units</p>
          {customUnits.length === 0 ? (
            <p className="text-sm text-muted-foreground italic">
              No custom units added yet.
            </p>
          ) : (
            <div className="flex flex-wrap gap-2">
              {customUnits.map((unit) => (
                <Badge
                  key={unit}
                  variant="secondary"
                  className="gap-1.5 pr-1 py-1.5"
                >
                  {unit}
                  <button
                    type="button"
                    onClick={() => handleRemove(unit)}
                    className="rounded-full hover:bg-muted-foreground/20 p-0.5"
                    aria-label={`Remove ${unit}`}
                  >
                    <X className="h-3 w-3" />
                  </button>
                </Badge>
              ))}
            </div>
          )}
        </div>

        <div className="space-y-2 rounded-lg border p-4">
          <div className="flex items-center gap-2">
            <Ruler className="h-4 w-4 text-muted-foreground" />
            <p className="text-sm font-medium">Built-in units</p>
          </div>
          <p className="text-xs text-muted-foreground">
            Always available, no need to add these yourself.
          </p>
          <div className="flex flex-wrap gap-1.5 pt-1">
            {FORM_SUGGESTIONS.common.units.map((unit) => (
              <Badge
                key={unit}
                variant="outline"
                className="text-xs font-normal"
              >
                {unit}
              </Badge>
            ))}
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
