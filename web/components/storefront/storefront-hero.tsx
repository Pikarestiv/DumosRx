"use client";

import Link from "next/link";

import { StoreInfoPanel } from "@/components/storefront/store-info-panel";
import { StoreOpenStatus } from "@/components/storefront/store-open-status";
import { useStorefrontI18n } from "@/components/storefront/storefront-i18n-provider";
import type { StorefrontProfile, StorefrontStore } from "@/lib/api/storefront-data";
import { storeAddressLine } from "@/lib/storefront-display";
import { summarizeHours } from "@/lib/storefront-hours";
import type { StorefrontHeroVariant } from "@/lib/storefront-presets";
import { DISPLAY_FONT, PRIMARY_BUTTON, SECONDARY_BUTTON } from "@/lib/storefront-styles";
import { cn } from "@/lib/utils";

interface StorefrontHeroProps {
  variant: StorefrontHeroVariant;
  tagline?: string | null;
  isPharmacy: boolean;
  store: StorefrontStore;
  storefront?: StorefrontProfile | null;
  catalogHref: string;
  whatsappHref: string | null;
}

export function StorefrontHero({ variant, tagline, isPharmacy, store, storefront, catalogHref, whatsappHref }: StorefrontHeroProps) {
  const { t, locale } = useStorefrontI18n();
  const centered = variant === "centered";
  const showPanel = variant === "band";
  const summary = [storeAddressLine(store), summarizeHours(storefront?.opening_hours, locale)].filter(Boolean).join("   ");
  const heading = tagline?.trim() || t(isPharmacy ? "tagline.pharmacy" : "tagline.retail");

  return (
    <section aria-label={t("hero.aria")} className="[background:var(--sf-hero-bg)] [color:var(--sf-hero-fg)]">
      <div
        className={cn(
          "mx-auto grid max-w-7xl gap-8 px-4 py-8 sm:px-6 sm:py-14 lg:px-8",
          showPanel && "lg:grid-cols-[minmax(0,1fr)_380px]",
          centered && "justify-items-center py-12 text-center sm:py-20",
        )}
      >
        <div className={cn("flex flex-col gap-6", centered ? "items-center" : "items-start")}>
          <StoreOpenStatus
            hours={storefront?.opening_hours}
            className="hidden rounded-full border border-current/30 px-3 py-1 sm:inline-flex"
          />
          <h1 className={cn(DISPLAY_FONT, "max-w-3xl text-3xl leading-[1.08] tracking-tight sm:text-5xl lg:text-6xl")}>
            {heading}
          </h1>
          <div className={cn("grid w-full grid-cols-2 gap-2 sm:flex sm:w-auto sm:gap-3", centered && "justify-center")}>
            <Link href={catalogHref} className={PRIMARY_BUTTON}>
              {t("hero.browse")}
            </Link>
            {whatsappHref && (
              <a href={whatsappHref} target="_blank" rel="noopener noreferrer" className={SECONDARY_BUTTON}>
                <span className="sm:hidden">{t("hero.whatsapp.short")}</span>
                <span className="hidden sm:inline">{t("hero.whatsapp")}</span>
              </a>
            )}
          </div>
          {summary && !centered && (
            <p className="border-t border-current/15 pt-4 text-sm opacity-75 lg:hidden">{summary}</p>
          )}
        </div>
        {showPanel && <StoreInfoPanel store={store} storefront={storefront} />}
      </div>
    </section>
  );
}
