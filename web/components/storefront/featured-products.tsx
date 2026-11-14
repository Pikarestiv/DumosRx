"use client";

import Link from "next/link";
import { useState } from "react";

import { useStorefrontI18n } from "@/components/storefront/storefront-i18n-provider";
import { useLiveFeatured } from "@/lib/use-live-featured";
import { ProductCard } from "@/components/storefront/product-card";
import { correctCategoryName } from "@/lib/storefront-categories";
import { toDisplayTitle, viewAllProductsLabel } from "@/lib/storefront-display";
import { DISPLAY_FONT, FOCUS_RING, SECONDARY_BUTTON } from "@/lib/storefront-styles";
import type { StorefrontProduct } from "@/lib/types/storefront";
import { cn } from "@/lib/utils";

const FEATURED_PRODUCT_COUNT = 8;

interface FeaturedProductsProps {
  products: StorefrontProduct[];
  productCount?: number;
  storeSlug: string;
  currency?: string | null;
  whatsapp?: string | null;
  catalogHref: string;
}

function categoryNames(products: StorefrontProduct[]): string[] {
  const counts = new Map<string, number>();
  for (const { category } of products) {
    if (category?.name) counts.set(category.name, (counts.get(category.name) ?? 0) + 1);
  }
  return [...counts.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0])).map(([name]) => name);
}

export function FeaturedProducts({ products: builtProducts, productCount: builtCount, storeSlug, currency, whatsapp, catalogHref }: FeaturedProductsProps) {
  const { t, tp, locale } = useStorefrontI18n();
  const { products, productCount } = useLiveFeatured(storeSlug, builtProducts, builtCount);
  const [active, setActive] = useState<string | null>(null);
  const categories = categoryNames(products);
  const shown = (active ? products.filter((p) => p.category?.name === active) : products).slice(0, FEATURED_PRODUCT_COUNT);
  const total = productCount ?? products.length;

  if (products.length === 0) {
    return (
      <div className="rounded-[var(--sf-card-radius)] border border-black/10 bg-white px-6 py-14 text-center">
        <p className="text-lg font-semibold">{t("products.empty.title")}</p>
        <p className="mt-1 text-sm opacity-75">{t("products.empty.body")}</p>
      </div>
    );
  }

  const chip = (selected: boolean) =>
    cn(
      "inline-flex min-h-11 shrink-0 items-center rounded-full border px-4 text-sm font-medium transition-colors",
      FOCUS_RING,
      selected
        ? "border-[color:var(--sf-ink)] bg-[color:var(--sf-ink)] text-[color:var(--sf-page)]"
        : "border-black/15 bg-white hover:border-[color:var(--sf-ink)]",
    );

  return (
    <section aria-label={t("products.heading")} className="space-y-5">
      <div className="flex items-end justify-between gap-4">
        <h2 className={`${DISPLAY_FONT} text-2xl sm:text-4xl`}>{t("products.heading")}</h2>
        <p className="text-sm opacity-70 [font-family:var(--sf-font-price)]">{tp("products.count", total)}</p>
      </div>

      {categories.length > 0 && (
        <div role="group" aria-label={t("products.categories")} className="-mx-4 flex gap-2 overflow-x-auto px-4 pb-1 sm:mx-0 sm:flex-wrap sm:px-0">
          <button type="button" aria-pressed={active === null} onClick={() => setActive(null)} className={chip(active === null)}>
            {t("products.all", { count: total })}
          </button>
          {categories.map((name) => (
            <button key={name} type="button" aria-pressed={active === name} onClick={() => setActive(name)} className={chip(active === name)}>
              {toDisplayTitle(correctCategoryName(name))}
            </button>
          ))}
        </div>
      )}

      <div className="grid grid-cols-2 gap-3 sm:gap-5 lg:grid-cols-4 xl:grid-cols-5">
        {shown.map((product) => (
          <ProductCard key={product.id} product={product} storeSlug={storeSlug} currency={currency} whatsapp={whatsapp} />
        ))}
      </div>

      <div className="flex justify-center pt-2">
        <Link href={catalogHref} className={SECONDARY_BUTTON}>
          {viewAllProductsLabel(products.length, productCount, locale)}
        </Link>
      </div>
    </section>
  );
}
