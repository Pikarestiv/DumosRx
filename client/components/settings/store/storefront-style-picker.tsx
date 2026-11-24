import { cn } from "@/lib/utils";
import type { StorefrontPresetId } from "@/lib/types/storefront-settings";
import { EnterpriseBadge } from "./enterprise-badge";
import { STOREFRONT_PRESETS } from "./storefront-preset-options";

interface StorefrontStylePickerProps {
  selected: StorefrontPresetId | null;
  allowed: StorefrontPresetId[];
  onSelect: (preset: StorefrontPresetId) => void;
}

export function StorefrontStylePicker({ selected, allowed, onSelect }: StorefrontStylePickerProps) {
  return (
    <div role="radiogroup" aria-label="Storefront style" className="grid gap-3 md:grid-cols-3">
      {STOREFRONT_PRESETS.map((option) => {
        const locked = !allowed.includes(option.id);
        return (
          <button
            key={option.id}
            type="button"
            role="radio"
            aria-checked={selected === option.id}
            disabled={locked}
            onClick={() => onSelect(option.id)}
            className={cn(
              "space-y-1 rounded-lg border p-3 text-left text-sm disabled:cursor-not-allowed disabled:opacity-60",
              selected === option.id && "ring-2 ring-primary",
            )}
          >
            <span className="flex items-center justify-between gap-2 font-medium">
              {option.label}
              {locked ? <EnterpriseBadge /> : null}
            </span>
            <span className="block text-xs text-muted-foreground">{option.description}</span>
          </button>
        );
      })}
    </div>
  );
}
