"use client";

import { useEffect, useState } from "react";

import { getStorefrontProducts } from "@/lib/api/storefront-data";
import { withoutStock } from "@/lib/storefront-product";
import type { StorefrontProduct } from "@/lib/types/storefront";

interface LiveFeatured {
  products: StorefrontProduct[];
  productCount?: number;
}

export function useLiveFeatured(storeSlug: string, initial: StorefrontProduct[], initialCount?: number): LiveFeatured {
  const [liveById, setLiveById] = useState<ReadonlyMap<string, StorefrontProduct> | null>(null);
  const builtIds = initial.map((product) => product.id).join(",");

  useEffect(() => {
    if (!builtIds) return;
    let cancelled = false;
    getStorefrontProducts(storeSlug, { ids: builtIds.split(","), per_page: 100 })
      .then((page) => {
        const asked = new Set(builtIds.split(","));
        const honoured = page?.data.every((product) => asked.has(product.id));
        if (!cancelled && page && honoured) setLiveById(new Map(page.data.map((product) => [product.id, product])));
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [storeSlug, builtIds]);

  if (!liveById) return { products: initial.map(withoutStock), productCount: initialCount };

  return {
    products: initial.flatMap((product) => liveById.get(product.id) ?? []),
    productCount: initialCount,
  };
}
