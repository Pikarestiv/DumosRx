"use client";

import { Check } from "lucide-react";
import { toast } from "sonner";

import { useSetStoreStorefrontThemeMutation } from "@/lib/api/admin-hooks";
import { checkIsSuperAdmin, useAdminAuthStore } from "@/lib/store/use-admin-auth-store";
import { STOREFRONT_THEMES, resolveStorefrontTheme } from "@/lib/storefront-themes";
import type { AdminStoreDetail } from "@/lib/types/admin-store-detail";
import { cn } from "@/lib/utils";

export function StorefrontThemePicker({ store }: { store: AdminStoreDetail }) {
  const { user } = useAdminAuthStore();
  const setTheme = useSetStoreStorefrontThemeMutation();
  const current = resolveStorefrontTheme(store.storefront.theme);
  const allowed = store.storefront.available_themes;
  const classicThemes = STOREFRONT_THEMES.filter((theme) => !theme.preset);
  const themes = allowed ? classicThemes.filter((theme) => allowed.includes(theme.id)) : classicThemes;

  if (!checkIsSuperAdmin(user?.role)) {
    return (
      <p className="text-sm text-muted-foreground">
        Theme: <span className="font-medium text-foreground">{current.label}</span>
      </p>
    );
  }

  const choose = (theme: string) => {
    if (theme === current.id) return;
    setTheme.mutate(
      { id: store.id, theme },
      {
        onSuccess: () => toast.success("Storefront theme saved; it goes live with the next rebuild"),
        onError: (error) =>
          toast.error(error instanceof Error && error.message ? error.message : "Could not change the theme"),
      },
    );
  };

  return (
    <div className="space-y-2">
      <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Classic accent themes</p>
      <div role="group" aria-label="Storefront theme" className="flex flex-wrap gap-3">
        {themes.map((theme) => {
          const selected = theme.id === current.id;
          return (
            <button
              key={theme.id}
              type="button"
              aria-pressed={selected}
              aria-label={`${theme.label} theme`}
              disabled={setTheme.isPending}
              onClick={() => choose(theme.id)}
              className={cn(
                "flex flex-col items-center gap-1 rounded-xl p-1.5 text-xs transition-colors disabled:opacity-60",
                selected ? "ring-2 ring-foreground" : "hover:bg-muted",
              )}
            >
              <span
                aria-hidden="true"
                className="flex h-8 w-8 items-center justify-center rounded-full"
                style={{ backgroundColor: theme.light.primary, color: theme.light.primaryForeground }}
              >
                {selected ? <Check className="h-4 w-4" /> : null}
              </span>
              <span className="text-muted-foreground">{theme.label}</span>
            </button>
          );
        })}
      </div>
    </div>
  );
}
