import { useState, useEffect } from "react";
import { getCustomerRetentionMetrics } from "@/lib/db/queries/customers";
import { getStockMoM } from "@/lib/db/queries/inventory";

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
    fetchMetrics();
  }, []);

  return { data, isLoading };
}

export function useStockMoM() {
  const [data, setData] = useState<{ currentValue: number; previousValue: number; percentChange: number } | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    async function fetchMetrics() {
      setIsLoading(true);
      try {
        const metrics = await getStockMoM();
        setData(metrics);
      } catch (error) {
        console.error("Failed to fetch stock MoM metrics:", error);
      } finally {
        setIsLoading(false);
      }
    }
    fetchMetrics();
  }, []);

  return { data, isLoading };
}
