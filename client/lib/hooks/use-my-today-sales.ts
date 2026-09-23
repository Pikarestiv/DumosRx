"use client";

import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { useAuth } from "@/lib/context/auth-context";
import { getRecentSales } from "@/lib/db/queries/sales";
import { calculateNetSaleAmount } from "@/lib/utils/pos-calculations";
import { getLocalTodayDate } from "@/lib/utils";
import { queryKeys } from "@/lib/query-keys";

/**
 * "My sales today": the cashier-relevant equivalent of inventory-value
 * metrics, which a sales_staff account has no reason to see (they don't
 * manage stock). Mirrors the todayMetrics calculation in
 * pos-transaction-history.tsx, scoped to the signed-in user's own sales.
 *
 * Filters by date in SQL (via getRecentSales's dateRange param) rather
 * than fetching an undated, LIMIT-100 "recent sales" page and filtering
 * for "today" client-side afterward - a cashier who personally rings more
 * than 100 sales today would otherwise have the earliest ones silently
 * dropped before the "is today" filter even runs. A dated query also gets
 * getRecentSales's higher LIMIT 500 cap instead of 100.
 */
export function useMyTodaySales() {
  const { user } = useAuth();
  const isCashier = user?.role === "sales_staff";
  const today = getLocalTodayDate();

  const { data: salesToday } = useQuery({
    ...queryKeys.sales.recent(user?.id, { from: today, to: today }),
    queryFn: () => getRecentSales(user?.id, { from: today, to: today }),
    enabled: isCashier && !!user?.id,
  });

  const totalToday = useMemo(() => {
    if (!salesToday) return 0;
    return salesToday.reduce(
      (acc, s) =>
        acc +
        calculateNetSaleAmount(
          Number(s.total_amount) || Number(s.total) || 0,
          Number(s.total_refunded) || 0,
        ),
      0,
    );
  }, [salesToday]);

  return { isCashier, totalToday, transactionsToday: salesToday?.length ?? 0 };
}
