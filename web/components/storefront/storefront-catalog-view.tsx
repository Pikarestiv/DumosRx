"use client";

import { useEffect, useRef, useSyncExternalStore } from "react";
import { Loader2, Search, X } from "lucide-react";

import { CatalogCategoryChips, CatalogCategorySidebar } from "@/components/storefront/catalog-category-filter";
import { ProductCard } from "@/components/storefront/product-card";
import type { PaginatedStorefrontProducts } from "@/lib/api/storefront-data";
import { ProductGridSkeleton } from "@/components/storefront/product-grid-skeleton";
import { FOCUS_RING, SECONDARY_BUTTON } from "@/lib/storefront-styles";
import { useStorefrontCatalog } from "@/lib/use-storefront-catalog";

interface StorefrontCatalogViewProps {
  storeSlug: string;
  currency?: string | null;
  whatsapp?: string | null;
  initialData: PaginatedStorefrontProducts | null;
}

const SCROLL_PRELOAD_MARGIN = "600px";

const subscribeToLocation = (notify: () => void) => {
  window.addEventListener("popstate", notify);
  return () => window.removeEventListener("popstate", notify);
};

export function StorefrontCatalogView({ storeSlug, currency, whatsapp, initialData }: StorefrontCatalogViewProps) {
  const urlSearch = useSyncExternalStore(subscribeToLocation, () => window.location.search, () => "");
  const params = new URLSearchParams(urlSearch);
  const catalog = useStorefrontCatalog({
    storeSlug,
    initialData,
    initialQuery: params.get("q") ?? "",
    branch: params.get("branch") || undefined,
  });
  const { items, status, hasMore, loadMore } = catalog;
  const sentinel = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const node = sentinel.current;
    if (!node || typeof IntersectionObserver === "undefined") return;
    const observer = new IntersectionObserver((entries) => entries[0]?.isIntersecting && loadMore(), {
      rootMargin: SCROLL_PRELOAD_MARGIN,
    });
    observer.observe(node);
    return () => observer.disconnect();
  }, [loadMore]);

  const filtered = Boolean(catalog.search.trim() || catalog.category);
  const refreshing = status === "loading";
  const hasCategories = catalog.categories.length > 0;

  return (
    <div className={hasCategories ? "grid gap-8 lg:grid-cols-[240px_minmax(0,1fr)]" : "grid gap-8"}>
      {hasCategories && (
        <CatalogCategorySidebar
          categories={catalog.categories}
          selected={catalog.category}
          onSelect={catalog.setCategory}
          total={catalog.allTotal}
        />
      )}

      <div className="min-w-0 space-y-5">
        <div role="search" className="relative">
          <Search aria-hidden="true" className="absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 opacity-60" />
          <input
            type="search"
            aria-label="Search products"
            placeholder="Search by name or brand…"
            value={catalog.search}
            onChange={(event) => catalog.setSearch(event.target.value)}
            className={`h-12 w-full rounded-[var(--sf-button-radius)] border border-black/10 bg-white pl-10 pr-10 text-sm [&::-webkit-search-cancel-button]:hidden ${FOCUS_RING}`}
          />
          {catalog.search && (
            <button
              type="button"
              aria-label="Clear search"
              onClick={() => catalog.setSearch("")}
              className="absolute right-1.5 top-1/2 flex h-10 w-10 -translate-y-1/2 items-center justify-center"
            >
              <X aria-hidden="true" className="h-4 w-4" />
            </button>
          )}
        </div>

        <CatalogCategoryChips categories={catalog.categories} selected={catalog.category} onSelect={catalog.setCategory} />

        <p aria-live="polite" className="flex items-center gap-2 text-sm opacity-75">
          {catalog.total} {catalog.total === 1 ? "product" : "products"}
          {refreshing && <Loader2 aria-label="Updating results" className="h-3.5 w-3.5 animate-spin" />}
        </p>

        {status === "error" && (
          <div role="alert" className="flex flex-wrap items-center gap-3 rounded-[var(--sf-card-radius)] border border-destructive/40 bg-white p-4 text-sm">
            <span>We couldn&apos;t load the products.</span>
            <button type="button" onClick={() => void catalog.retry()} className={SECONDARY_BUTTON}>
              Try again
            </button>
          </div>
        )}

        {items.length === 0 && refreshing ? (
          <ProductGridSkeleton />
        ) : items.length === 0 && status !== "error" ? (
          <div className="rounded-[var(--sf-card-radius)] border border-black/10 bg-white py-16 text-center">
            <p className="text-lg font-semibold">No products found</p>
            <p className="mb-4 text-sm opacity-75">Try a different search or category.</p>
            {filtered && (
              <button type="button" onClick={catalog.resetFilters} className={SECONDARY_BUTTON}>
                Reset filters
              </button>
            )}
          </div>
        ) : (
          <div className={`grid grid-cols-2 gap-3 sm:gap-5 lg:grid-cols-3 xl:grid-cols-4 ${refreshing ? "opacity-60" : ""}`}>
            {items.map((product) => (
              <ProductCard key={product.id} product={product} storeSlug={storeSlug} currency={currency} whatsapp={whatsapp} />
            ))}
          </div>
        )}

        <div ref={sentinel} className="flex justify-center py-4">
          {hasMore && (
            <button type="button" onClick={loadMore} disabled={status === "loadingMore"} className={SECONDARY_BUTTON}>
              {status === "loadingMore" ? "Loading…" : "Load more products"}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
