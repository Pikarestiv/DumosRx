"use client";

import { useEffect, useState } from "react";

import { HomeGridMoreTile } from "@/components/storefront/home-grid-more-tile";
import { useStorefrontI18n } from "@/components/storefront/storefront-i18n-provider";
import { StorefrontServiceCard } from "@/components/storefront/storefront-service-card";
import { getStorefrontServices, type StorefrontService } from "@/lib/api/storefront-services";
import { toDisplayTitle } from "@/lib/storefront-display";
import { SERVICE_GRID_CAPACITY, homeGridLayout } from "@/lib/storefront-home-grid";
import { DISPLAY_FONT, categoryChip } from "@/lib/storefront-styles";
import { cn } from "@/lib/utils";

interface StorefrontServicesProps {
  storeSlug: string;
  currency?: string | null;
  whatsapp?: string | null;
}

function serviceCategories(services: StorefrontService[]): string[] {
  return [...new Set(services.map((service) => service.category?.trim()).filter((name): name is string => Boolean(name)))].sort((a, b) =>
    a.localeCompare(b),
  );
}

export function StorefrontServices({ storeSlug, currency, whatsapp }: StorefrontServicesProps) {
  const { t, tp } = useStorefrontI18n();
  const [services, setServices] = useState<StorefrontService[]>([]);
  const [active, setActive] = useState<string | null>(null);
  const [expanded, setExpanded] = useState(false);

  useEffect(() => {
    let cancelled = false;
    getStorefrontServices(storeSlug)
      .then((list) => !cancelled && setServices(list))
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [storeSlug]);

  if (services.length === 0) return null;

  const categories = serviceCategories(services);
  const filtered = active ? services.filter((service) => service.category?.trim() === active) : services;
  const layout = expanded
    ? { shownCount: filtered.length, itemClasses: filtered.map(() => "block"), moreTile: null }
    : homeGridLayout(filtered.length, filtered.length, SERVICE_GRID_CAPACITY);
  const choose = (category: string | null) => {
    setActive(category);
    setExpanded(false);
  };

  return (
    <section aria-labelledby="services-heading" className="space-y-5">
      <div className="space-y-1">
        <div className="flex items-end justify-between gap-4">
          <h2 id="services-heading" className={`text-2xl sm:text-4xl ${DISPLAY_FONT}`}>{t("services.heading")}</h2>
          <p className="text-sm opacity-70 [font-family:var(--sf-font-price)]">{tp("services.count", services.length)}</p>
        </div>
        <p className="text-sm opacity-75">{t("services.subtitle")}</p>
      </div>

      {categories.length > 0 && (
        <div role="group" aria-label={t("products.categories")} className="-mx-4 flex gap-2 overflow-x-auto px-4 pb-1 sm:mx-0 sm:flex-wrap sm:px-0">
          <button type="button" aria-pressed={active === null} onClick={() => choose(null)} className={categoryChip(active === null)}>
            {t("products.all", { count: services.length })}
          </button>
          {categories.map((name) => (
            <button key={name} type="button" aria-pressed={active === name} onClick={() => choose(name)} className={categoryChip(active === name)}>
              {toDisplayTitle(name)}
            </button>
          ))}
        </div>
      )}

      <div className="grid grid-cols-2 gap-3 sm:gap-5 lg:grid-cols-4 xl:grid-cols-5">
        {filtered.slice(0, layout.shownCount).map((service, index) => (
          <div key={service.id} className={cn("h-full", layout.itemClasses[index])}>
            <StorefrontServiceCard service={service} storeSlug={storeSlug} currency={currency} whatsapp={whatsapp} />
          </div>
        ))}
        {layout.moreTile && (
          <HomeGridMoreTile tile={layout.moreTile} label={t("services.more.aria", { count: filtered.length })} onClick={() => setExpanded(true)} />
        )}
      </div>
    </section>
  );
}
