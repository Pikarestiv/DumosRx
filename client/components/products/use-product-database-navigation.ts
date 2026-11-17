"use client";

import { useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import type { Product } from "./types";

interface Params {
  products: Product[];
  rawProducts: unknown;
  setShowAddDialog: (open: boolean) => void;
  setStatusFilter: (status: string) => void;
  setSelectedProduct: (product: Product | null) => void;
}

export function useProductDatabaseNavigation({
  products,
  rawProducts,
  setShowAddDialog,
  setStatusFilter,
  setSelectedProduct,
}: Params) {
  const searchParams = useSearchParams();
  const router = useRouter();
  const searchParamsKey = searchParams.toString();
  const [appliedSearchParamsKey, setAppliedSearchParamsKey] = useState<string | null>(null);

  if (searchParamsKey !== appliedSearchParamsKey) {
    setAppliedSearchParamsKey(searchParamsKey);
    if (searchParams.get("action") === "add") setShowAddDialog(true);
    const status = searchParams.get("status");
    if (status) setStatusFilter(status);
  }

  useEffect(() => {
    if (searchParams.get("action") !== "add") return;
    const newParams = new URLSearchParams(searchParams.toString());
    newParams.delete("action");
    const newUrl =
      window.location.pathname +
      (newParams.toString() ? `?${newParams.toString()}` : "");
    router.replace(newUrl);
  }, [searchParams, router]);

  const deepLinkProductId = searchParams.get("productId");
  const [deepLinkSource, setDeepLinkSource] = useState<{
    searchParamsKey: string;
    rawProducts: unknown;
  } | null>(null);

  if (
    deepLinkProductId &&
    rawProducts &&
    (deepLinkSource?.searchParamsKey !== searchParamsKey ||
      deepLinkSource.rawProducts !== rawProducts)
  ) {
    setDeepLinkSource({ searchParamsKey, rawProducts });
    const match = products.find((p) => p.id === deepLinkProductId);
    if (match) setSelectedProduct(match);
  }

  useEffect(() => {
    if (!searchParams.get("productId") || !rawProducts) return;
    const newParams = new URLSearchParams(searchParams.toString());
    newParams.delete("productId");
    const newUrl =
      window.location.pathname +
      (newParams.toString() ? `?${newParams.toString()}` : "");
    router.replace(newUrl);
  }, [searchParams, rawProducts, router]);
}
