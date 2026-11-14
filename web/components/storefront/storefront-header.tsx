import { Suspense } from "react";
import Link from "next/link";
import { Search } from "lucide-react";

import { StoreBranchSelector } from "@/components/storefront/store-branch-selector";
import { StoreLogo } from "@/components/storefront/store-logo";
import { StoreOpenStatus } from "@/components/storefront/store-open-status";
import { StorefrontCart } from "@/components/storefront/storefront-cart";
import { StorefrontUtilityBar } from "@/components/storefront/storefront-utility-bar";
import type { StorefrontBranch, StorefrontProfile, StorefrontStore } from "@/lib/api/storefront-data";
import { storeTypeLabel } from "@/lib/storefront-copy";
import { storeNameTextClass } from "@/lib/storefront-display";
import { DISPLAY_FONT } from "@/lib/storefront-styles";

interface StorefrontHeaderProps {
  storeSlug: string;
  store?: StorefrontStore | null;
  storefront?: StorefrontProfile | null;
  branches?: StorefrontBranch[];
  selectedBranchId?: string;
}

export function StorefrontHeader({ storeSlug, store, storefront, branches, selectedBranchId }: StorefrontHeaderProps) {
  const brandName = storefront?.name || store?.name || "Store";
  const logo = storefront?.logo_url || store?.logo_url;
  const subtitle = [storeTypeLabel(store), store?.location?.trim()].filter(Boolean).join(" · ");
  const home = `/store/${storeSlug}`;
  const hasBranches = Boolean(branches && branches.length > 1);
  const branchSelector = (
    <Suspense fallback={null}>
      <StoreBranchSelector branches={branches ?? []} selectedBranchId={selectedBranchId || store?.id || ""} storeSlug={storeSlug} />
    </Suspense>
  );

  return (
    <>
      <StorefrontUtilityBar />
      <header className="sticky top-0 z-40 border-b border-black/10 bg-white/95 backdrop-blur-sm">
        <div className="mx-auto flex min-h-16 max-w-7xl items-center gap-3 px-4 py-2 sm:gap-6 sm:px-6 lg:px-8">
          <Link href={home} title={brandName} className="flex min-w-0 items-center gap-3">
            <StoreLogo name={brandName} logo={logo} />
            <span className="min-w-0">
              <span className={`${DISPLAY_FONT} block leading-tight line-clamp-2 break-words ${storeNameTextClass(brandName)}`}>
                {brandName}
              </span>
              {subtitle && <span className="hidden text-xs opacity-70 sm:block">{subtitle}</span>}
              <StoreOpenStatus hours={storefront?.opening_hours} className="text-xs text-emerald-800 sm:hidden" />
            </span>
          </Link>

          <form action={`${home}/catalog`} method="get" role="search" className="relative ml-auto hidden max-w-xl flex-1 sm:ml-4 sm:block">
            <Search aria-hidden="true" className="absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 opacity-60" />
            <input
              type="search"
              name="q"
              aria-label="Search products"
              placeholder="Search products…"
              className="h-11 w-full rounded-[var(--sf-button-radius)] border border-black/10 bg-[color:var(--sf-page)] pl-10 pr-4 text-sm"
            />
          </form>

          <div className="ml-auto flex shrink-0 items-center gap-2 sm:ml-0">
            <Link href={`${home}/catalog`} aria-label="Search products" className="inline-flex h-11 w-11 items-center justify-center rounded-[var(--sf-button-radius)] border border-black/10 sm:hidden">
              <Search aria-hidden="true" className="h-5 w-5" />
            </Link>
            {hasBranches && <div className="hidden sm:block">{branchSelector}</div>}
            <StorefrontCart storeSlug={storeSlug} currency={store?.currency} />
          </div>
        </div>
        {hasBranches && (
          <div className="flex items-center justify-between border-t border-black/10 px-4 py-2 sm:hidden">
            <span className="text-xs font-medium opacity-70">Branch:</span>
            {branchSelector}
          </div>
        )}
      </header>
    </>
  );
}
