import { useMemo } from "react";
import { useLocalData } from "@/lib/db/hooks/useLocalData";

export function usePurchasePatterns(dateFilter: string) {
  const { data: timeSlotData } = useLocalData<{
    slot: string;
    transactions: number;
    avg_value: number;
  }>(
    `SELECT
      CASE
        WHEN CAST(strftime('%H', transaction_date) AS INTEGER) BETWEEN 6 AND 11 THEN 'Morning (6am-12pm)'
        WHEN CAST(strftime('%H', transaction_date) AS INTEGER) BETWEEN 12 AND 16 THEN 'Afternoon (12pm-5pm)'
        WHEN CAST(strftime('%H', transaction_date) AS INTEGER) BETWEEN 17 AND 21 THEN 'Evening (5pm-10pm)'
        ELSE 'Night (10pm-6am)'
      END as slot,
      COUNT(*) as transactions,
      AVG(total_amount) as avg_value
     FROM sales
     WHERE transaction_date >= ? AND _deleted = 0
     GROUP BY slot
     ORDER BY MIN(strftime('%H', transaction_date)) ASC`,
    [dateFilter]
  );

  const { data: slotCategoryData } = useLocalData<{
    slot: string;
    category: string;
  }>(
    `SELECT slot, category FROM (
       SELECT
         CASE
           WHEN CAST(strftime('%H', s.transaction_date) AS INTEGER) BETWEEN 6 AND 11 THEN 'Morning (6am-12pm)'
           WHEN CAST(strftime('%H', s.transaction_date) AS INTEGER) BETWEEN 12 AND 16 THEN 'Afternoon (12pm-5pm)'
           WHEN CAST(strftime('%H', s.transaction_date) AS INTEGER) BETWEEN 17 AND 21 THEN 'Evening (5pm-10pm)'
           ELSE 'Night (10pm-6am)'
         END as slot,
         COALESCE(c.name, 'General') as category,
         COUNT(*) as cnt,
         ROW_NUMBER() OVER (
           PARTITION BY CASE
             WHEN CAST(strftime('%H', s.transaction_date) AS INTEGER) BETWEEN 6 AND 11 THEN 'Morning (6am-12pm)'
             WHEN CAST(strftime('%H', s.transaction_date) AS INTEGER) BETWEEN 12 AND 16 THEN 'Afternoon (12pm-5pm)'
             WHEN CAST(strftime('%H', s.transaction_date) AS INTEGER) BETWEEN 17 AND 21 THEN 'Evening (5pm-10pm)'
             ELSE 'Night (10pm-6am)'
           END
           ORDER BY COUNT(*) DESC
         ) as rn
       FROM sale_items si
       JOIN medicines m ON si.medicine_id = m.id
       LEFT JOIN categories c ON m.category_id = c.id
       JOIN sales s ON si.sale_id = s.id
       WHERE s.transaction_date >= ? AND s._deleted = 0
       GROUP BY slot, c.name
     ) WHERE rn = 1`,
    [dateFilter]
  );

  const purchasePatterns = useMemo(() => {
    return (timeSlotData || []).map((slot) => {
      const topCat = slotCategoryData.find((s) => s.slot === slot.slot);
      return {
        slot: slot.slot,
        transactions: slot.transactions,
        avgValue: slot.avg_value || 0,
        topCategory: topCat?.category || "General",
      };
    });
  }, [timeSlotData, slotCategoryData]);

  return purchasePatterns;
}
