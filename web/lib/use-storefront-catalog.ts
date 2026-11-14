"use client";

import { useCallback, useEffect, useRef, useState } from "react";

import {
  getStorefrontProducts,
  type PaginatedStorefrontProducts,
  type StorefrontCategory,
} from "@/lib/api/storefront-data";
import type { StorefrontProduct } from "@/lib/types/storefront";

export const CATALOG_PAGE_SIZE = 48;
export const SEARCH_DEBOUNCE_MS = 350;

type CatalogStatus = "idle" | "loading" | "loadingMore" | "error";

interface CatalogState {
  items: StorefrontProduct[];
  page: number;
  lastPage: number;
  total: number;
  allTotal: number;
  categories: StorefrontCategory[];
  status: CatalogStatus;
}

interface UseStorefrontCatalogOptions {
  storeSlug: string;
  initialData: PaginatedStorefrontProducts | null;
  initialQuery: string;
  branch?: string;
}

const stateFrom = (data: PaginatedStorefrontProducts | null): CatalogState => ({
  items: data?.data ?? [],
  page: data?.meta.current_page ?? 1,
  lastPage: data?.meta.last_page ?? 1,
  total: data?.meta.total ?? 0,
  allTotal: data?.meta.total ?? 0,
  categories: data?.categories ?? [],
  status: "idle",
});

function useDebounced<T>(value: T, delayMs: number): T {
  const [debounced, setDebounced] = useState(value);
  useEffect(() => {
    const timer = setTimeout(() => setDebounced(value), delayMs);
    return () => clearTimeout(timer);
  }, [value, delayMs]);
  return debounced;
}

export function useStorefrontCatalog({ storeSlug, initialData, initialQuery, branch }: UseStorefrontCatalogOptions) {
  const [search, setSearch] = useState(initialQuery);
  const [category, setCategory] = useState<string | null>(null);
  const [state, setState] = useState<CatalogState>(() => stateFrom(initialData));
  const latestRequest = useRef(0);

  useEffect(() => {
    if (initialQuery) setSearch(initialQuery);
  }, [initialQuery]);
  const query = useDebounced(search.trim(), SEARCH_DEBOUNCE_MS);

  const load = useCallback(
    async (page: number, replace: boolean) => {
      const request = ++latestRequest.current;
      setState((prev) => ({ ...prev, status: replace ? "loading" : "loadingMore" }));
      try {
        const res = await getStorefrontProducts(storeSlug, {
          page,
          q: query || undefined,
          category: category ?? undefined,
          branch,
          per_page: CATALOG_PAGE_SIZE,
        });
        if (request !== latestRequest.current) return;
        if (!res) throw new Error("Store unavailable");
        setState((prev) => {
          const known = new Set(replace ? [] : prev.items.map((item) => item.id));
          const fresh = res.data.filter((item) => !known.has(item.id));
          return {
            items: replace ? res.data : [...prev.items, ...fresh],
            page: res.meta.current_page,
            lastPage: res.meta.last_page,
            total: res.meta.total,
            allTotal: query || category ? prev.allTotal : res.meta.total,
            categories: res.categories ?? prev.categories,
            status: "idle",
          };
        });
      } catch {
        if (request === latestRequest.current) setState((prev) => ({ ...prev, status: "error" }));
      }
    },
    [storeSlug, query, category, branch],
  );

  useEffect(() => {
    // Refreshes on mount too, so the build-time page 1 never outlives the first paint.
    void load(1, true);
  }, [load]);

  const hasMore = state.page < state.lastPage;
  const loadMore = useCallback(() => {
    if (hasMore && state.status === "idle") void load(state.page + 1, false);
  }, [hasMore, state.status, state.page, load]);

  const resetFilters = useCallback(() => {
    setSearch("");
    setCategory(null);
  }, []);

  return { ...state, search, setSearch, category, setCategory, hasMore, loadMore, retry: () => load(1, true), resetFilters };
}
