import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { formatDateToDDMMYYYY } from "@/lib/utils/date-utils";
import { useStore } from "@/lib/context/store-context";
import { getDailyCloseData } from "@/lib/db/queries/sales";
import { getPaymentAccounts } from "@/lib/db/queries/setup";
import { queryKeys } from "@/lib/query-keys";
import type { PaymentAccount } from "@/lib/types/payment-account";

interface PaymentSplitEntry {
  method: string;
  amount: number;
  accountId?: string;
}

export function useDailyCloseData(reportDate: string) {
  const { storeProfile } = useStore();
  const currencyCode = storeProfile?.currency;

  const { data: dailyCloseData } = useQuery({
    ...queryKeys.dailyClose.data(reportDate),
    queryFn: () => getDailyCloseData(reportDate)
  });

  const salesToday = dailyCloseData?.salesToday || [];
  const itemsToday = dailyCloseData?.itemsToday || [];
  const returnsToday = dailyCloseData?.returnsToday || [];
  const returnItemsToday = dailyCloseData?.returnItemsToday || [];

  const { data: paymentAccountsData } = useQuery({
    ...queryKeys.paymentAccounts.all(),
    queryFn: () => getPaymentAccounts()
  });

  const paymentAccounts = paymentAccountsData || [];

  const { aggregatedTotals, totalProfit, topSellingMeds } = useMemo(() => {
    const totals = {
      cash: 0,
      card: 0,
      transfer: 0,
      credit: 0,
      total: 0,
      refunds: 0,
      cardAccounts: {} as Record<string, {name: string; total: number}>,
      transferAccounts: {} as Record<string, {name: string; total: number}>,
    };

    const addAccountTotal = (method: "card" | "transfer", accountId: string | null, amount: number) => {
      const bucket = method === "card" ? totals.cardAccounts : totals.transferAccounts;
      const key = accountId || "uncategorized";
      if (!bucket[key]) {
        const acc = paymentAccounts?.find((a: PaymentAccount) => a.id === key);
        bucket[key] = { 
          name: key === "uncategorized" ? `Uncategorized ${method === "card" ? "Card" : "Transfer"}` : (acc?.name || "Unknown Account"), 
          total: 0 
        };
      }
      bucket[key].total += amount;
    };

    salesToday.forEach((sale) => {
      totals.total += sale.total_amount;
      const method = sale.payment_method?.toLowerCase();
      let parsedDetails: { splits?: PaymentSplitEntry[]; accountId?: string } | null = null;

      try {
        if (sale.payment_details) {
          parsedDetails = JSON.parse(sale.payment_details);
        }
      } catch (e) {
        console.error("Error parsing payment details", e);
      }

      if (method === "mixed" && parsedDetails?.splits && Array.isArray(parsedDetails.splits)) {
        parsedDetails.splits.forEach((split) => {
          const splitMethod = split.method?.toLowerCase();
          if (totals[splitMethod as keyof typeof totals] !== undefined) {
            (totals as Record<"cash" | "card" | "transfer" | "credit" | "total" | "refunds", number>)[splitMethod as "cash" | "card" | "transfer" | "credit" | "total" | "refunds"] += split.amount;
            if (splitMethod === "card" || splitMethod === "transfer") {
              addAccountTotal(splitMethod, split.accountId || null, split.amount);
            }
          }
        });
      } else if (totals[method as keyof typeof totals] !== undefined) {
        (totals as Record<"cash" | "card" | "transfer" | "credit" | "total" | "refunds", number>)[method as "cash" | "card" | "transfer" | "credit" | "total" | "refunds"] += sale.total_amount;
        if (method === "card" || method === "transfer") {
          addAccountTotal(method, parsedDetails?.accountId || null, sale.total_amount);
        }
      } else if (method === "mobile") {
        totals.transfer += sale.total_amount;
        addAccountTotal("transfer", parsedDetails?.accountId || null, sale.total_amount);
      }
    });

    returnsToday.forEach((ret) => {
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
        (totals as Record<"cash" | "card" | "transfer" | "credit" | "total" | "refunds", number>)[method as "cash" | "card" | "transfer" | "credit" | "total" | "refunds"] -= ret.total_refunded;
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

    itemsToday.forEach((item) => {
      const cost = item.cost_price || item.med_cost_price || 0;
      totalCostPrice += cost * item.quantity;

      if (!itemMap[item.product_id]) {
        itemMap[item.product_id] = {
          name: item.product_name || "Unknown",
          quantity: 0,
          revenue: 0,
        };
      }
      itemMap[item.product_id].quantity += item.quantity;
      itemMap[item.product_id].revenue += item.total_price;
    });

    returnItemsToday.forEach((item) => {
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
  }, [salesToday, itemsToday, returnsToday, returnItemsToday, paymentAccounts]);

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
      ...Object.values(aggregatedTotals.cardAccounts).map(a => [`  - ${a.name}`, a.total.toString()]),
      ["Transfer / Mobile", aggregatedTotals.transfer.toString()],
      ...Object.values(aggregatedTotals.transferAccounts).map(a => [`  - ${a.name}`, a.total.toString()]),
      ["Credit Sales", aggregatedTotals.credit.toString()],
      [],
      ["Highest Selling Products"],
      ["Product", "Qty Sold", "Revenue"],
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
    salesToday,
    aggregatedTotals,
    totalProfit,
    topSellingMeds,
    exportToCSV,
  };
}
