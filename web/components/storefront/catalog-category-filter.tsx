"use client";

import { useStorefrontI18n } from "@/components/storefront/storefront-i18n-provider";
import { correctCategoryName } from "@/lib/storefront-categories";
import { FOCUS_RING } from "@/lib/storefront-styles";
import { toDisplayTitle } from "@/lib/storefront-display";
import type { StorefrontCategory } from "@/lib/api/storefront-data";
import { cn } from "@/lib/utils";

interface CatalogCategoryFilterProps {
  categories: StorefrontCategory[];
  selected: string | null;
  onSelect: (id: string | null) => void;
  total: number;
}

const label = (name: string) => toDisplayTitle(correctCategoryName(name));

export function CatalogCategorySidebar({ categories, selected, onSelect, total }: CatalogCategoryFilterProps) {
  const { t } = useStorefrontI18n();
  const row = (active: boolean) =>
    cn(
      "flex min-h-11 w-full items-center justify-between gap-3 rounded-[var(--sf-button-radius)] px-3 text-left text-sm transition-colors",
      FOCUS_RING,
      active ? "bg-[color:var(--sf-ink)] text-[color:var(--sf-page)]" : "hover:bg-black/5",
    );

  return (
    <nav aria-label={t("products.categories")} className="hidden lg:sticky lg:top-24 lg:block lg:self-start">
      <h2 className="mb-2 px-3 text-xs font-semibold uppercase tracking-widest opacity-70">{t("products.categories")}</h2>
      <ul className="max-h-[calc(100vh-8rem)] space-y-0.5 overflow-y-auto">
        <li>
          <button type="button" aria-pressed={selected === null} onClick={() => onSelect(null)} className={row(selected === null)}>
            <span>{t("shop.categories.all")}</span>
            <span className="tabular-nums opacity-70">{total}</span>
          </button>
        </li>
        {categories.map((cat) => (
          <li key={cat.id}>
            <button type="button" aria-pressed={selected === cat.id} onClick={() => onSelect(cat.id)} className={row(selected === cat.id)}>
              <span className="truncate">{label(cat.name)}</span>
              <span className="tabular-nums opacity-70">{cat.count}</span>
            </button>
          </li>
        ))}
      </ul>
    </nav>
  );
}

export function CatalogCategoryChips({ categories, selected, onSelect }: Omit<CatalogCategoryFilterProps, "total">) {
  const { t } = useStorefrontI18n();
  const chip = (active: boolean) =>
    cn(
      "inline-flex min-h-11 shrink-0 items-center rounded-full border px-4 text-sm font-medium transition-colors",
      FOCUS_RING,
      active ? "border-[color:var(--sf-ink)] bg-[color:var(--sf-ink)] text-[color:var(--sf-page)]" : "border-black/15 bg-white",
    );

  if (categories.length === 0) return null;

  return (
    <div role="group" aria-label={t("products.categories")} className="-mx-4 flex gap-2 overflow-x-auto px-4 pb-1 lg:hidden">
      <button type="button" aria-pressed={selected === null} onClick={() => onSelect(null)} className={chip(selected === null)}>
        {t("shop.categories.allShort")}
      </button>
      {categories.map((cat) => (
        <button key={cat.id} type="button" aria-pressed={selected === cat.id} onClick={() => onSelect(cat.id)} className={chip(selected === cat.id)}>
          {label(cat.name)}
        </button>
      ))}
    </div>
  );
}
