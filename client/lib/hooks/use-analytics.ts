import { useState, useEffect } from "react";
import { useQuery } from "@tanstack/react-query";
import { getCustomerRetentionMetrics } from "@/lib/db/queries/customers";
import { getStockMoM } from "@/lib/db/queries/inventory";
import { queryKeys } from "@/lib/query-keys";

export function useCustomerRetention() {
  const [data, setData] = useState<{ retentionRate: number; avgVisits: number; avgTransactionValue: number } | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    async function fetchMetrics() {
      setIsLoading(true);
      try {
        const metrics = await getCustomerRetentionMetrics();
        setData(metrics);
      } catch (error) {
        console.error("Failed to fetch customer retention metrics:", error);
      } finally {
        setIsLoading(false);
      }
    }
    void fetchMetrics();
  }, []);

  return { data, isLoading };
}

/**
 * The "+x% from last month" figure on the Total stock value card.
 *
 * In react-query (not a bare useState/useEffect([]) fetch) so it is keyed by
 * the active store and invalidated by stock_movements/stock_batches writes
 * like every other inventory figure: the one-shot effect resolved
 * getActiveStoreId() once at mount and never re-ran, so after a store switch
 * the percentage kept describing the previous store's inventory next to the
 * new store's value - two different stores in one card.
 */
export function useStockMoM() {
  const { data, isLoading } = useQuery({
    ...queryKeys.stockBatches.mom(),
    queryFn: () => getStockMoM(),
  });

  return { data: data ?? null, isLoading };
}
