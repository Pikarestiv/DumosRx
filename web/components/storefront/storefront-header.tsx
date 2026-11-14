"use client";

import { Suspense } from "react";
import Link from "next/link";
import { Search } from "lucide-react";

import { StoreBranchSelector } from "@/components/storefront/store-branch-selector";
import { StoreLogo } from "@/components/storefront/store-logo";
import { StoreOpenStatus } from "@/components/storefront/store-open-status";
import { StorefrontCart } from "@/components/storefront/storefront-cart";
import { useStorefrontI18n } from "@/components/storefront/storefront-i18n-provider";
import { StorefrontUtilityBar } from "@/components/storefront/storefront-utility-bar";
import type { StorefrontBranch, StorefrontProfile, StorefrontStore } from "@/lib/api/storefront-data";
import { storeNameTextClass } from "@/lib/storefront-display";
import { DISPLAY_FONT, FOCUS_RING } from "@/lib/storefront-styles";

interface StorefrontHeaderProps {
  storeSlug: string;
  store?: StorefrontStore | null;
  storefront?: StorefrontProfile | null;
  branches?: StorefrontBranch[];
  selectedBranchId?: string;
}

const TYPE_KEYS = new Map<string, "type.pharmacy" | "type.retail" | "type.supermarket" | "type.grocery" | "type.general">([
  ["pharmacy", "type.pharmacy"],
  ["retail", "type.retail"],
  ["supermarket", "type.supermarket"],
  ["grocery", "type.grocery"],
  ["general", "type.general"],
]);

export function StorefrontHeader({ storeSlug, store, storefront, branches, selectedBranchId }: StorefrontHeaderProps) {
  const { t } = useStorefrontI18n();
  const brandName = storefront?.name || store?.name || t("header.fallbackName");
  const logo = storefront?.logo_url || store?.logo_url;
  const typeKey = store?.store_type ? TYPE_KEYS.get(store.store_type) : undefined;
  const typeLabel = typeKey ? t(typeKey) : store?.store_type ? store.store_type.charAt(0).toUpperCase() + store.store_type.slice(1) : null;
  const subtitle = [typeLabel, store?.location?.trim()].filter(Boolean).join(" · ");
  const home = `/store/${storeSlug}`;
  const hasBranches = Boolean(branches && branches.length > 1);
  const branchSelector = (
    <Suspense fallback={null}>
      <StoreBranchSelector branches={branches ?? []} selectedBranchId={selectedBranchId || store?.id || ""} storeSlug={storeSlug} />
    </Suspense>
  );

  return (
    <>
      <a
        href="#main-content"
        className="sr-only focus:not-sr-only focus:absolute focus:left-2 focus:top-2 focus:z-50 focus:rounded focus:bg-white focus:px-3 focus:py-2 focus:text-sm"
      >
        {t("skip.toContent")}
      </a>
      <StorefrontUtilityBar deliveryAvailable={storefront?.delivery_available} />
      <header className="sticky top-0 z-40 border-b border-black/10 bg-white/95 backdrop-blur-sm">
        <div className="mx-auto flex min-h-16 max-w-7xl items-center gap-3 px-4 py-2 sm:gap-6 sm:px-6 lg:px-8">
          <Link href={home} title={brandName} className={`flex min-w-0 items-center gap-3 ${FOCUS_RING}`}>
            <StoreLogo name={brandName} logo={logo} />
            <span className="min-w-0">
              <span className={`${DISPLAY_FONT} block leading-tight line-clamp-2 break-words ${storeNameTextClass(brandName)}`}>
                {brandName}
              </span>
              {subtitle && <span className="hidden text-xs opacity-70 sm:block">{subtitle}</span>}
              <StoreOpenStatus hours={storefront?.opening_hours} timeZone={store?.timezone} className="text-xs sm:hidden" openClassName="text-emerald-800" />
            </span>
          </Link>

          <form action={`${home}/catalog`} method="get" role="search" className="relative ml-auto hidden max-w-xl flex-1 sm:ml-4 sm:block">
            <Search aria-hidden="true" className="absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 opacity-60" />
            <input
              type="search"
              name="q"
              aria-label={t("header.search.label")}
              placeholder={t("header.search.placeholder")}
              className={`h-11 w-full rounded-[var(--sf-button-radius)] border border-black/10 bg-[color:var(--sf-page)] pl-10 pr-4 text-sm ${FOCUS_RING}`}
            />
          </form>

          <div className="ml-auto flex shrink-0 items-center gap-2 sm:ml-0">
            <Link href={`${home}/catalog`} aria-label={t("header.search.label")} className={`inline-flex h-11 w-11 items-center justify-center rounded-[var(--sf-button-radius)] border border-black/10 sm:hidden ${FOCUS_RING}`}>
              <Search aria-hidden="true" className="h-5 w-5" />
            </Link>
            {hasBranches && <div className="hidden sm:block">{branchSelector}</div>}
            <StorefrontCart storeSlug={storeSlug} currency={store?.currency} />
          </div>
        </div>
        {hasBranches && (
          <div className="flex items-center justify-between border-t border-black/10 px-4 py-2 sm:hidden">
            <span className="text-xs font-medium opacity-70">{t("header.branch")}</span>
            {branchSelector}
          </div>
        )}
      </header>
    </>
  );
}
