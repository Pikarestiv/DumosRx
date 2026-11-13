import { Suspense } from "react";
import Link from "next/link";

import { StoreBranchSelector } from "@/components/storefront/store-branch-selector";
import { StorefrontCart } from "@/components/storefront/storefront-cart";
import { storefrontNavLinks } from "@/lib/storefront-nav";
import type {
  StorefrontBranch,
  StorefrontProfile,
  StorefrontStore,
} from "@/lib/api/storefront-data";

interface StorefrontHeaderProps {
  storeSlug: string;
  store?: StorefrontStore | null;
  storefront?: StorefrontProfile | null;
  branches?: StorefrontBranch[];
  selectedBranchId?: string;
}

export function StorefrontHeader({
  storeSlug,
  store,
  storefront,
  branches,
  selectedBranchId,
}: StorefrontHeaderProps) {
  const brandName = storefront?.name || store?.name || "Store";
  const logo = storefront?.logo_url || store?.logo_url;

  return (
    <header className="bg-background/95 backdrop-blur-sm border-b border-border sticky top-0 z-40">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 h-16 flex items-center justify-between gap-4">
        <div className="flex items-center gap-4 min-w-0">
          <Link
            href={`/store/${storeSlug}`}
            className="flex items-center gap-3 min-w-0"
          >
            {logo && (
              // eslint-disable-next-line @next/next/no-img-element -- static export arbitrary data URI
              <img
                src={logo}
                alt=""
                className="h-9 w-9 object-contain rounded"
              />
            )}
            <span className="font-heading font-bold text-xl text-primary truncate max-w-[160px] sm:max-w-[240px]">
              {brandName}
            </span>
          </Link>

          {branches && branches.length > 1 && (
            <div className="hidden sm:block">
              <Suspense fallback={null}>
                <StoreBranchSelector
                  branches={branches}
                  selectedBranchId={selectedBranchId || store?.id || ""}
                  storeSlug={storeSlug}
                />
              </Suspense>
            </div>
          )}
        </div>

        <div className="flex items-center gap-3 sm:gap-6">
          <nav aria-label="Store" className="flex items-center gap-3 sm:gap-5 text-sm font-medium">
            {storefrontNavLinks(storeSlug, store).map((link) => (
              <Link
                key={link.label}
                href={link.href}
                className="text-muted-foreground hover:text-foreground transition-colors"
              >
                {link.label}
              </Link>
            ))}
          </nav>
          <StorefrontCart storeSlug={storeSlug} currency={store?.currency} />
        </div>
      </div>
      {branches && branches.length > 1 && (
        <div className="sm:hidden border-t border-border/60 px-4 py-2 bg-muted/20 flex items-center justify-between">
          <span className="text-xs text-muted-foreground font-medium">
            Branch:
          </span>
          <Suspense fallback={null}>
            <StoreBranchSelector
              branches={branches}
              selectedBranchId={selectedBranchId || store?.id || ""}
              storeSlug={storeSlug}
            />
          </Suspense>
        </div>
      )}
    </header>
  );
}
