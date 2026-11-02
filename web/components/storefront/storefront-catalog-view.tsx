"use client";

import { useState, useTransition } from "react";
import { Search, Loader2, ChevronLeft, ChevronRight, X } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { ProductCard } from "@/components/storefront/product-card";
import {
  getStorefrontProducts,
  type PaginatedStorefrontProducts,
  type StorefrontCategory,
} from "@/lib/api/storefront-data";
import type { StorefrontProduct } from "@/lib/types/storefront";

interface StorefrontCatalogViewProps {
  storeSlug: string;
  currency?: string | null;
  initialData: PaginatedStorefrontProducts | null;
}

export function StorefrontCatalogView({
  storeSlug,
  currency,
  initialData,
}: StorefrontCatalogViewProps) {
  const [data, setData] = useState<PaginatedStorefrontProducts | null>(initialData);
  const [search, setSearch] = useState("");
  const [selectedCategory, setSelectedCategory] = useState<string | null>(null);
  const [page, setPage] = useState(1);
  const [isPending, startTransition] = useTransition();

  const categories: StorefrontCategory[] = data?.categories || initialData?.categories || [];
  const products: StorefrontProduct[] = data?.data || [];
  const meta = data?.meta;

  const fetchCatalog = (newPage: number, newSearch: string, newCategory: string | null) => {
    startTransition(async () => {
      try {
        const res = await getStorefrontProducts(storeSlug, {
          page: newPage,
          q: newSearch.trim() || undefined,
          category: newCategory || undefined,
        });
        if (res) {
          setData(res);
          setPage(newPage);
        }
      } catch (err) {
        console.error("Failed to load catalog page:", err);
      }
    });
  };

  const handleSearchSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    fetchCatalog(1, search, selectedCategory);
  };

  const handleClearSearch = () => {
    setSearch("");
    fetchCatalog(1, "", selectedCategory);
  };

  const handleCategorySelect = (catId: string | null) => {
    setSelectedCategory(catId);
    fetchCatalog(1, search, catId);
  };

  const handlePageChange = (newPage: number) => {
    if (newPage < 1 || (meta && newPage > meta.last_page)) return;
    fetchCatalog(newPage, search, selectedCategory);
    window.scrollTo({ top: 0, behavior: "smooth" });
  };

  return (
    <div className="space-y-6">
      <div className="bg-white dark:bg-slate-900 rounded-3xl border border-slate-200 dark:border-slate-800 shadow-sm p-4 sm:p-6 space-y-4">
        <form onSubmit={handleSearchSubmit} className="flex gap-2">
          <div className="relative flex-1">
            <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              type="text"
              placeholder="Search products by name, generic name, or barcode…"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="pl-10 pr-9 bg-background rounded-xl border-border"
            />
            {search && (
              <button
                type="button"
                onClick={handleClearSearch}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground p-0.5"
                aria-label="Clear search"
              >
                <X className="h-4 w-4" />
              </button>
            )}
          </div>
          <Button type="submit" disabled={isPending} className="rounded-xl px-5">
            {isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : "Search"}
          </Button>
        </form>

        {categories.length > 0 && (
          <div className="flex items-center gap-1.5 flex-wrap pt-1">
            <span className="text-xs font-semibold text-muted-foreground mr-1">Categories:</span>
            <Badge
              variant={selectedCategory === null ? "default" : "outline"}
              onClick={() => handleCategorySelect(null)}
              className="cursor-pointer text-xs py-1 px-3 rounded-full transition-colors"
            >
              All
            </Badge>
            {categories.map((cat) => (
              <Badge
                key={cat.id}
                variant={selectedCategory === cat.id ? "default" : "outline"}
                onClick={() => handleCategorySelect(cat.id)}
                className="cursor-pointer text-xs py-1 px-3 rounded-full transition-colors"
              >
                {cat.name} ({cat.count})
              </Badge>
            ))}
          </div>
        )}
      </div>

      <div className="flex items-center justify-between text-sm text-muted-foreground px-1">
        <span>
          {meta
            ? `Showing ${meta.from ?? 0}–${meta.to ?? 0} of ${meta.total} products`
            : `${products.length} product(s)`}
        </span>
        {isPending && (
          <span className="flex items-center gap-1.5 text-xs text-primary font-medium">
            <Loader2 className="h-3.5 w-3.5 animate-spin" />
            Updating results…
          </span>
        )}
      </div>

      {products.length === 0 ? (
        <div className="text-center py-16 bg-white dark:bg-slate-900 rounded-3xl border border-slate-200 dark:border-slate-800 shadow-sm">
          <p className="text-lg font-semibold text-foreground mb-1">No products found</p>
          <p className="text-sm text-muted-foreground mb-4">
            Try adjusting your search terms or selecting a different category.
          </p>
          {(search || selectedCategory) && (
            <Button
              variant="outline"
              onClick={() => {
                setSearch("");
                setSelectedCategory(null);
                fetchCatalog(1, "", null);
              }}
              className="rounded-xl"
            >
              Reset Filters
            </Button>
          )}
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
          {products.map((product) => (
            <ProductCard
              key={product.id}
              product={product}
              storeSlug={storeSlug}
              currency={currency}
            />
          ))}
        </div>
      )}

      {meta && meta.last_page > 1 && (
        <div className="flex items-center justify-center gap-2 pt-6 pb-4">
          <Button
            variant="outline"
            size="sm"
            onClick={() => handlePageChange(page - 1)}
            disabled={page <= 1 || isPending}
            className="rounded-xl flex items-center gap-1"
          >
            <ChevronLeft className="h-4 w-4" />
            Previous
          </Button>

          <span className="text-sm font-medium px-3 text-muted-foreground">
            Page {meta.current_page} of {meta.last_page}
          </span>

          <Button
            variant="outline"
            size="sm"
            onClick={() => handlePageChange(page + 1)}
            disabled={page >= meta.last_page || isPending}
            className="rounded-xl flex items-center gap-1"
          >
            Next
            <ChevronRight className="h-4 w-4" />
          </Button>
        </div>
      )}
    </div>
  );
}
