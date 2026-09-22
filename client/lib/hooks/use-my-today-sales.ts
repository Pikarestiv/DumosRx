"use client";

import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { isToday, parseISO } from "date-fns";
import { useAuth } from "@/lib/context/auth-context";
import { getRecentSales } from "@/lib/db/queries/sales";
import { calculateNetSaleAmount } from "@/lib/utils/pos-calculations";
import { queryKeys } from "@/lib/query-keys";

/**
 * "My sales today": the cashier-relevant equivalent of inventory-value
 * metrics, which a sales_staff account has no reason to see (they don't
 * manage stock). Mirrors the todayMetrics calculation in
 * pos-transaction-history.tsx, scoped to the signed-in user's own sales.
 */
export function useMyTodaySales() {
  const { user } = useAuth();
  const isCashier = user?.role === "sales_staff";

  const { data: recentSales } = useQuery({
    ...queryKeys.sales.recent(user?.id),
    queryFn: () => getRecentSales(user?.id),
    enabled: isCashier && !!user?.id,
  });

  const totalToday = useMemo(() => {
    if (!recentSales) return 0;
    return recentSales
      .filter((s) => s.created_at && isToday(parseISO(s.created_at)))
      .reduce(
        (acc, s) =>
          acc +
          calculateNetSaleAmount(
            Number(s.total_amount) || Number(s.total) || 0,
            Number(s.total_refunded) || 0,
          ),
        0,
      );
  }, [recentSales]);

  return { isCashier, totalToday };
}
