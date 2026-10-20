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

// The "+x% from last month" figure on the Total stock value card.
// Rationale: docs/CLIENT_LIB_COMMENTS.md#hooks-use-analytics-L29
export function useStockMoM() {
  const { data, isLoading } = useQuery({
    ...queryKeys.stockBatches.mom(),
    queryFn: () => getStockMoM(),
  });

  return { data: data ?? null, isLoading };
}
