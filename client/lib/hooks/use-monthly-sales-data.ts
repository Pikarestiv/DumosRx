import { useMemo } from "react";
import { useLocalData } from "@/lib/db/hooks/useLocalData";

export function useMonthlySalesData(dateFilter: string) {
  const { data: rawMonthlyData } = useLocalData<{
    month: string;
    revenue: number;
    cogs: number;
    transactions: number;
  }>(
    `SELECT
      strftime('%Y-%m', s.transaction_date) as month,
      SUM(s.total_amount) as revenue,
      SUM(si.cost_price * si.quantity) as cogs,
      COUNT(DISTINCT s.id) as transactions
     FROM sales s
     LEFT JOIN sale_items si ON s.id = si.sale_id
     WHERE s.transaction_date >= ? AND (s._deleted = 0 OR s._deleted IS NULL)
     GROUP BY strftime('%Y-%m', s.transaction_date)
     ORDER BY strftime('%Y-%m', s.transaction_date) ASC`,
    [dateFilter],
  );

  const { data: rawMonthlyReturns } = useLocalData<{
    month: string;
    refunds: number;
    returned_cogs: number;
  }>(
    `SELECT
      strftime('%Y-%m', r.created_at) as month,
      SUM(r.total_refunded) as refunds,
      SUM(ri.quantity * IFNULL((SELECT AVG(cost_price) FROM stock_batches WHERE product_id = m.id AND is_active = 1), 0)) as returned_cogs
     FROM returns r
     LEFT JOIN return_items ri ON ri.return_id = r.id
     LEFT JOIN products m ON ri.product_id = m.id
     WHERE r.created_at >= ? AND (r._deleted = 0 OR r._deleted IS NULL)
     GROUP BY strftime('%Y-%m', r.created_at)
     ORDER BY strftime('%Y-%m', r.created_at) ASC`,
    [dateFilter],
  );

  const { data: rawExpenseData } = useLocalData<{
    month: string;
    expenses: number;
  }>(
    `SELECT
      strftime('%Y-%m', date) as month,
      SUM(amount) as expenses
     FROM expenses
     WHERE date >= ? AND _deleted = 0
     GROUP BY strftime('%Y-%m', date)`,
    [dateFilter],
  );

  const monthlySalesData = useMemo(() => {
    const monthNames = [
      "Jan",
      "Feb",
      "Mar",
      "Apr",
      "May",
      "Jun",
      "Jul",
      "Aug",
      "Sep",
      "Oct",
      "Nov",
      "Dec",
    ];
    return rawMonthlyData.map((item) => {
      const exp =
        rawExpenseData.find((e) => e.month === item.month)?.expenses || 0;
      const returns = rawMonthlyReturns.find((e) => e.month === item.month) || {
        refunds: 0,
        returned_cogs: 0,
      };

      const netRevenue = item.revenue - (returns.refunds || 0);
      const netCogs = item.cogs - (returns.returned_cogs || 0);

      let monthLabel = item.month;
      if (item.month) {
        const parts = item.month.split("-");
        if (parts.length === 2) {
          const mIdx = parseInt(parts[1], 10) - 1;
          if (mIdx >= 0 && mIdx < 12) {
            monthLabel = `${monthNames[mIdx]} '${parts[0].slice(2)}`;
          }
        }
      }
      return {
        ...item,
        revenue: netRevenue,
        cogs: netCogs,
        month: monthLabel,
        profit: netRevenue - netCogs - exp,
        expenses: exp,
      };
    });
  }, [rawMonthlyData, rawExpenseData, rawMonthlyReturns]);

  return monthlySalesData;
}
