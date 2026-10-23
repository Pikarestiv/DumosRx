"use client";

import { useMemo } from "react";
import { useHasPermission } from "@/lib/hooks/use-permissions";
import { describeStock } from "@/lib/utils/stock-status";

export function useStockVisibility() {
  const canSeeQuantities = useHasPermission("view_stock_quantities");

  return useMemo(
    () => ({
      canSeeQuantities,
      describeStock: (qty: number, reorderLevel?: number | null) =>
        describeStock(qty, reorderLevel, canSeeQuantities),
    }),
    [canSeeQuantities],
  );
}
