import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { getPurchasePatterns, type SalesFilters } from "@/lib/db/queries/reports";
import { queryKeys } from "@/lib/query-keys";

export function usePurchasePatterns(dateFilter: string, filters?: SalesFilters) {
  const { data: metrics } = useQuery({
    ...queryKeys.bi.purchasePatterns(dateFilter, filters?.staffId, filters?.paymentMethod),
    queryFn: () => getPurchasePatterns(dateFilter, filters)
  });

  const purchasePatterns = useMemo(() => {
    const timeSlotData = metrics?.timeSlotData || [];
    const slotCategoryData = metrics?.slotCategoryData || [];
    return timeSlotData.map((slot) => {
      const topCat = slotCategoryData.find((c) => c.slot === slot.slot);
      return {
        slot: slot.slot.split(" ")[0], // "Morning", "Afternoon", etc.
        transactions: slot.transactions,
        avgValue: slot.avg_value || 0,
        topCategory: topCat?.category || "N/A",
      };
    });
  }, [metrics?.timeSlotData, metrics?.slotCategoryData]);

  return purchasePatterns;
}
