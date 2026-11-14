"use client";

import { useEffect, useState } from "react";

import { getStorefrontData } from "@/lib/api/storefront-data";
import { withoutStock } from "@/lib/storefront-product";
import type { StorefrontProduct } from "@/lib/types/storefront";

interface LiveFeatured {
  products: StorefrontProduct[];
  productCount?: number;
}

export function useLiveFeatured(storeSlug: string, initial: StorefrontProduct[], initialCount?: number): LiveFeatured {
  const [live, setLive] = useState<LiveFeatured | null>(null);

  useEffect(() => {
    let cancelled = false;
    getStorefrontData(storeSlug)
      .then((data) => {
        if (!cancelled && data) setLive({ products: data.products, productCount: data.product_count });
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [storeSlug]);

  return live
    ? { products: live.products, productCount: live.productCount ?? initialCount }
    : { products: initial.map(withoutStock), productCount: initialCount };
}
