"use client";

import { toast } from "sonner";

import { StorefrontPresetPreview } from "./storefront-preset-preview";
import { useSetStoreStorefrontThemeMutation } from "@/lib/api/admin-hooks";
import { defaultTagline } from "@/lib/storefront-copy";
import { STOREFRONT_PRESETS } from "@/lib/storefront-presets";
import { resolveStorefrontPreset, resolveStorefrontTheme } from "@/lib/storefront-themes";
import type { AdminStoreDetail } from "@/lib/types/admin-store-detail";
import { cn } from "@/lib/utils";

interface StorefrontPresetPickerProps {
  store: AdminStoreDetail;
  accent: string | null;
  editable: boolean;
}

export function StorefrontPresetPicker({ store, accent, editable }: StorefrontPresetPickerProps) {
  const setTheme = useSetStoreStorefrontThemeMutation();
  const { storefront } = store;
  const currentTheme = resolveStorefrontTheme(storefront.theme);
  const effective = resolveStorefrontPreset(storefront.theme, store.store_type);
  const allowed = storefront.available_themes;
  const presets = allowed ? STOREFRONT_PRESETS.filter((preset) => allowed.includes(preset.id)) : STOREFRONT_PRESETS;
  const tagline = storefront.tagline?.trim() || defaultTagline(store.store_type);

  const choose = (id: string) =>
    setTheme.mutate(
      { id: store.id, theme: id },
      {
        onSuccess: () => toast.success("Style saved; it goes live with the next rebuild"),
        onError: (error) =>
          toast.error(error instanceof Error && error.message ? error.message : "Could not change the style"),
      },
    );

  return (
    <div className="space-y-3">
      <div>
        <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Style preset</p>
        {currentTheme.preset ? null : (
          <p className="mt-1 text-xs text-muted-foreground">
            This store still uses the classic {currentTheme.label} accent theme, which renders on the{" "}
            <span className="font-medium text-foreground">{effective.label}</span> preset until another is chosen.
          </p>
        )}
      </div>
      <div role="group" aria-label="Storefront style preset" className="grid gap-4 md:grid-cols-3">
        {presets.map((preset) => {
          const selected = currentTheme.preset === preset.id;
          return (
            <button
              key={preset.id}
              type="button"
              aria-pressed={selected}
              aria-label={`${preset.label} style`}
              disabled={!editable || setTheme.isPending}
              onClick={() => !selected && choose(preset.id)}
              className={cn(
                "space-y-2 rounded-xl p-2 text-left transition-colors disabled:cursor-default",
                selected ? "ring-2 ring-foreground" : editable && "hover:bg-muted",
              )}
            >
              <StorefrontPresetPreview
                preset={preset}
                accent={accent}
                storeName={store.name}
                logo={storefront.logo_url}
                tagline={tagline}
              />
              <span className="flex items-center justify-between px-1 text-sm font-medium">
                {preset.label}
                {selected ? <span className="text-xs text-muted-foreground">Selected</span> : null}
              </span>
            </button>
          );
        })}
      </div>
    </div>
  );
}
