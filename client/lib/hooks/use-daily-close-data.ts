import { useState, useMemo } from "react";
import { formatDateToDDMMYYYY } from "@/lib/utils/date-utils";
import { useLocalData } from "@/lib/db/hooks/useLocalData";
import { useStore } from "@/lib/context/store-context";
import { getLocalTodayDate } from "@/lib/utils";

export function useDailyCloseData() {
  const { storeProfile } = useStore();
  const currencyCode = storeProfile?.currency;

  const [reportDate, setReportDate] = useState(getLocalTodayDate());

  // 1. Fetch sales for the selected date
  const { data: salesToday } = useLocalData<any>(
    `SELECT * FROM sales WHERE date(transaction_date) = '${reportDate}' AND _deleted = 0`,
  );

  // 2. Fetch sale items to calculate profit and top sellers
  const { data: itemsToday } = useLocalData<any>(
    `SELECT si.*, m.name as medicine_name, m.cost_price as med_cost_price 
     FROM sale_items si 
     JOIN sales s ON si.sale_id = s.id 
     LEFT JOIN medicines m ON si.medicine_id = m.id 
     WHERE date(s.transaction_date) = '${reportDate}' AND (si._deleted = 0 OR si._deleted IS NULL) AND (s._deleted = 0 OR s._deleted IS NULL)`,
  );

  // 3. Fetch returns for the selected date
  const { data: returnsToday } = useLocalData<any>(
    `SELECT r.*, s.payment_method, s.payment_details 
     FROM returns r 
     JOIN sales s ON r.sale_id = s.id 
     WHERE date(r.created_at) = '${reportDate}' AND (r._deleted = 0 OR r._deleted IS NULL)`,
  );

  // 4. Fetch return items for cost adjustment
  const { data: returnItemsToday } = useLocalData<any>(
    `SELECT ri.*, m.cost_price as med_cost_price
     FROM return_items ri
     JOIN returns r ON ri.return_id = r.id
     LEFT JOIN medicines m ON ri.medicine_id = m.id
     WHERE date(r.created_at) = '${reportDate}' AND (ri._deleted = 0 OR ri._deleted IS NULL) AND (r._deleted = 0 OR r._deleted IS NULL)`,
  );

  const { aggregatedTotals, totalProfit, topSellingMeds } = useMemo(() => {
    const totals = {
      cash: 0,
      card: 0,
      transfer: 0,
      credit: 0,
      total: 0,
      refunds: 0,
    };

    salesToday.forEach((sale: any) => {
      totals.total += sale.total_amount;
      const method = sale.payment_method?.toLowerCase();

      if (method === "mixed" && sale.payment_details) {
        try {
          const details = JSON.parse(sale.payment_details);
          if (details.splits && Array.isArray(details.splits)) {
            details.splits.forEach((split: any) => {
              const splitMethod = split.method?.toLowerCase();
              if (totals[splitMethod as keyof typeof totals] !== undefined) {
                totals[splitMethod as keyof typeof totals] += split.amount;
              }
            });
          }
        } catch (e) {
          console.error("Error parsing mixed payment details", e);
        }
      } else if (totals[method as keyof typeof totals] !== undefined) {
        totals[method as keyof typeof totals] += sale.total_amount;
      } else if (method === "mobile") {
        totals.transfer += sale.total_amount;
      }
    });

    returnsToday.forEach((ret: any) => {
      totals.total -= ret.total_refunded;
      totals.refunds += ret.total_refunded;
      const method = ret.payment_method?.toLowerCase();

      if (method === "mixed") {
        totals.cash -= ret.total_refunded;
      } else if (
        totals[method as keyof typeof totals] !== undefined &&
        method !== "total" &&
        method !== "refunds"
      ) {
        (totals as any)[method] -= ret.total_refunded;
      } else if (method === "mobile") {
        totals.transfer -= ret.total_refunded;
      }
    });

    // Calculate top sellers & profit
    let totalCostPrice = 0;
    const itemMap: Record<
      string,
      { name: string; quantity: number; revenue: number }
    > = {};

    itemsToday.forEach((item: any) => {
      const cost = item.cost_price || item.med_cost_price || 0;
      totalCostPrice += cost * item.quantity;

      if (!itemMap[item.medicine_id]) {
        itemMap[item.medicine_id] = {
          name: item.medicine_name || "Unknown",
          quantity: 0,
          revenue: 0,
        };
      }
      itemMap[item.medicine_id].quantity += item.quantity;
      itemMap[item.medicine_id].revenue += item.total_price;
    });

    returnItemsToday.forEach((item: any) => {
      const cost = item.cost_price || item.med_cost_price || 0;
      totalCostPrice -= cost * item.quantity;
    });

    const calculatedProfit = totals.total - totalCostPrice;
    const topMeds = Object.values(itemMap)
      .sort((a, b) => b.quantity - a.quantity)
      .slice(0, 5);

    return {
      aggregatedTotals: totals,
      totalProfit: calculatedProfit,
      topSellingMeds: topMeds,
    };
  }, [salesToday, itemsToday, returnsToday, returnItemsToday]);

  const exportToCSV = () => {
    const csvContent = [
      ["Daily Close Report", `Generated: ${formatDateToDDMMYYYY(new Date())}`],
      ["Total Net Sales", aggregatedTotals.total.toString()],
      ["Total Refunds", aggregatedTotals.refunds.toString()],
      ["Cash Expected", aggregatedTotals.cash.toString()],
      ["Transfer / Mobile", aggregatedTotals.transfer.toString()],
      ["Total Net Profit (Est.)", totalProfit.toString()],
      [],
      ["Payment Breakdown"],
      ["Method", "Amount"],
      ["Cash", aggregatedTotals.cash.toString()],
      ["Card / POS", aggregatedTotals.card.toString()],
      ["Transfer / Mobile", aggregatedTotals.transfer.toString()],
      ["Credit Sales", aggregatedTotals.credit.toString()],
      [],
      ["Highest Selling Medicines"],
      ["Medicine", "Qty Sold", "Revenue"],
      ...topSellingMeds.map((med) => [
        med.name,
        med.quantity.toString(),
        med.revenue.toString(),
      ]),
    ]
      .map((row) =>
        row
          .map((cell) => {
            const s = String(cell ?? "");
            return s.includes(",") || s.includes('"') || s.includes("\n")
              ? `"${s.replace(/"/g, '""')}"`
              : s;
          })
          .join(","),
      )
      .join("\n");

    const blob = new Blob([csvContent], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `Daily_Close_Report_${new Date().toISOString().slice(0, 10)}.csv`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  return {
    currencyCode,
    reportDate,
    setReportDate,
    salesToday,
    aggregatedTotals,
    totalProfit,
    topSellingMeds,
    exportToCSV,
  };
}
