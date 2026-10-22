import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { formatDateToDDMMYYYY } from "@/lib/utils/date-utils";
import { useStore } from "@/lib/context/store-context";
import { getDailyCloseData } from "@/lib/db/queries/sales";
import { getPaymentAccounts } from "@/lib/db/queries/setup";
import { getCashExpensesForDate } from "@/lib/db/queries/finance";
import { queryKeys } from "@/lib/query-keys";
import { buildNetCashBreakdown, buildProfitBreakdown } from "@/lib/utils/daily-close-breakdown";
import type { PaymentAccount } from "@/lib/types/payment-account";

interface PaymentSplitEntry {
  method: string;
  amount: number;
  accountId?: string;
}

export function useDailyCloseData(reportDate: string, showProfit = true) {
  const { storeProfile } = useStore();
  const currencyCode = storeProfile?.currency;

  const { data: dailyCloseData } = useQuery({
    ...queryKeys.dailyClose.data(reportDate),
    queryFn: () => getDailyCloseData(reportDate)
  });

  const rawSalesToday = useMemo(() => dailyCloseData?.salesToday || [], [dailyCloseData?.salesToday]);
  const itemsToday = useMemo(() => dailyCloseData?.itemsToday || [], [dailyCloseData?.itemsToday]);
  const returnsToday = useMemo(() => dailyCloseData?.returnsToday || [], [dailyCloseData?.returnsToday]);
  const returnItemsToday = useMemo(() => dailyCloseData?.returnItemsToday || [], [dailyCloseData?.returnItemsToday]);

  // itemsToday already has every line item for the day (product_name included) - reuse it to attach a "||"-joined item_names string per sale, sa…
  // Rationale: docs/CLIENT_LIB_COMMENTS.md#line-hooks-use-daily-close-data-ts-L31
  const salesToday = useMemo(() => {
    const namesBySale: Record<string, string[]> = {};
    itemsToday.forEach((item) => {
      (namesBySale[item.sale_id] ||= []).push(item.product_name || "");
    });
    return rawSalesToday.map((sale) => ({
      ...sale,
      item_names: (namesBySale[sale.id] || []).join("||"),
    }));
  }, [rawSalesToday, itemsToday]);

  const { data: cashExpenses = 0 } = useQuery({
    ...queryKeys.dailyClose.cashExpenses(reportDate),
    queryFn: () => getCashExpensesForDate(reportDate),
  });

  const { data: paymentAccountsData } = useQuery({
    ...queryKeys.paymentAccounts.all(),
    queryFn: () => getPaymentAccounts()
  });

  const paymentAccounts = useMemo(() => paymentAccountsData || [], [paymentAccountsData]);

  const { aggregatedTotals, profitBreakdown, cashSales, cashRefunds, topSellingMeds } = useMemo(() => {
    const totals = {
      cash: 0,
      card: 0,
      transfer: 0,
      credit: 0,
      // Catches any payment_method that isn't one of the four buckets above and isn't "mobile" (folded into transfer) - a NULL/blank method, a legac…
      // Rationale: docs/CLIENT_LIB_COMMENTS.md#line-hooks-use-daily-close-data-ts-L64
      other: 0,
      total: 0,
      refunds: 0,
      cardAccounts: {} as Record<string, {name: string; total: number}>,
      transferAccounts: {} as Record<string, {name: string; total: number}>,
    };
    type TotalsKey = "cash" | "card" | "transfer" | "credit" | "other" | "total" | "refunds";

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
          const key: TotalsKey = totals[splitMethod as keyof typeof totals] !== undefined
            ? (splitMethod as TotalsKey)
            : "other";
          (totals as Record<TotalsKey, number>)[key] += split.amount;
          if (key === "card" || key === "transfer") {
            addAccountTotal(key, split.accountId || null, split.amount);
          }
        });
      } else if (totals[method as keyof typeof totals] !== undefined) {
        (totals as Record<TotalsKey, number>)[method as TotalsKey] += sale.total_amount;
        if (method === "card" || method === "transfer") {
          addAccountTotal(method, parsedDetails?.accountId || null, sale.total_amount);
        }
      } else if (method === "mobile") {
        totals.transfer += sale.total_amount;
        addAccountTotal("transfer", parsedDetails?.accountId || null, sale.total_amount);
      } else {
        totals.other += sale.total_amount;
      }
    });

    const grossSales = totals.total;
    const cashSalesBeforeRefunds = totals.cash;

    // Sales keyed by id so a refund can find the sale it belongs to - used below for the VAT netting (see totalTaxToday).
    // Rationale: docs/CLIENT_LIB_COMMENTS.md#line-hooks-use-daily-close-data-ts-L129
    const salesById = new Map(salesToday.map((s) => [s.id, s]));
    let refundedTaxToday = 0;

    returnsToday.forEach((ret) => {
      totals.total -= ret.total_refunded;
      totals.refunds += ret.total_refunded;
      const method = ret.payment_method?.toLowerCase();

      // The VAT share already backed out of totals.total by this refund.
      // Rationale: docs/CLIENT_LIB_COMMENTS.md#line-hooks-use-daily-close-data-ts-L140
      const originalSale = salesById.get(ret.sale_id);
      if (originalSale && originalSale.total_amount) {
        refundedTaxToday +=
          (ret.total_refunded * (originalSale.tax_amount || 0)) / originalSale.total_amount;
      }

      let returnDetails: { splits?: PaymentSplitEntry[]; accountId?: string } | null = null;
      try {
        if (ret.payment_details) returnDetails = JSON.parse(ret.payment_details);
      } catch (e) {
        console.error("Error parsing payment details on return", e);
      }

      if (method === "mixed") {
        // The return flow has no way to record which specific method(s) a refund actually came back out of (no payment-method picker on a return), but…
        // Rationale: docs/CLIENT_LIB_COMMENTS.md#line-hooks-use-daily-close-data-ts-L161
        const splits = (returnDetails?.splits || []).filter((s) => s.amount > 0);
        const splitsTotal = splits.reduce((sum, s) => sum + s.amount, 0);
        if (splitsTotal > 0) {
          splits.forEach((split) => {
            const splitMethod = split.method?.toLowerCase();
            const share = (split.amount / splitsTotal) * ret.total_refunded;
            const key: TotalsKey = totals[splitMethod as keyof typeof totals] !== undefined
              ? (splitMethod as TotalsKey)
              : "other";
            (totals as Record<TotalsKey, number>)[key] -= share;
            // Decrement the specific sub-account line too, not just the parent card/transfer total - otherwise a card's itemized sub-lines ("Moniepoint PO…
            // Rationale: docs/CLIENT_LIB_COMMENTS.md#line-hooks-use-daily-close-data-ts-L181
            if (key === "card" || key === "transfer") {
              addAccountTotal(key, split.accountId || null, -share);
            }
          });
        } else {
          // The original sale has no usable splits.accountId/amount data to prorate against (legacy row, missing/corrupt payment_details) - `totals.tota…
          // Rationale: docs/CLIENT_LIB_COMMENTS.md#line-hooks-use-daily-close-data-ts-L191
          totals.other -= ret.total_refunded;
        }
      } else if (
        totals[method as keyof typeof totals] !== undefined &&
        method !== "total" &&
        method !== "refunds" &&
        method !== "other"
      ) {
        (totals as Record<TotalsKey, number>)[method as TotalsKey] -= ret.total_refunded;
        if (method === "card" || method === "transfer") {
          addAccountTotal(method, returnDetails?.accountId || null, -ret.total_refunded);
        }
      } else if (method === "mobile") {
        totals.transfer -= ret.total_refunded;
        addAccountTotal("transfer", returnDetails?.accountId || null, -ret.total_refunded);
      } else {
        totals.other -= ret.total_refunded;
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

    // Revenue already includes any reseller markup (it's part of the sale's selling price), so once that commission/markup has actually been paid…
    // Rationale: docs/CLIENT_LIB_COMMENTS.md#line-hooks-use-daily-close-data-ts-L243
    const redeemedResellerPayouts = salesToday.reduce(
      (sum, sale) =>
        sum +
        (sale.is_reseller_sale && sale.reseller_commission_redeemed
          ? Math.max(0, (sale.reseller_commission_redeemed_amount || 0) - (sale.reseller_commission_owed_back || 0))
          : 0),
      0,
    );

    // VAT/tax collected on the government's behalf is a liability, not profit, so it's backed out of the day's revenue.
    // Rationale: docs/CLIENT_LIB_COMMENTS.md#line-hooks-use-daily-close-data-ts-L257
    const totalTaxToday =
      salesToday.reduce((sum, sale) => sum + (sale.tax_amount || 0), 0) -
      refundedTaxToday;

    const topMeds = Object.values(itemMap)
      .sort((a, b) => b.quantity - a.quantity)
      .slice(0, 5);

    return {
      aggregatedTotals: totals,
      profitBreakdown: buildProfitBreakdown({
        grossSales,
        refunds: totals.refunds,
        tax: totalTaxToday,
        costOfGoods: totalCostPrice,
        resellerPayouts: redeemedResellerPayouts,
      }),
      cashSales: cashSalesBeforeRefunds,
      cashRefunds: cashSalesBeforeRefunds - totals.cash,
      topSellingMeds: topMeds,
    };
  }, [salesToday, itemsToday, returnsToday, returnItemsToday, paymentAccounts]);

  const netCashBreakdown = useMemo(
    () => buildNetCashBreakdown({ cashSales, cashRefunds, cashExpenses }),
    [cashSales, cashRefunds, cashExpenses],
  );
  const totalProfit = profitBreakdown.total;
  const netCashExpected = netCashBreakdown.total;

  const exportToCSV = () => {
    const csvContent = [
      ["Daily Close Report", `Generated: ${formatDateToDDMMYYYY(new Date())}`],
      ["Total Net Sales", aggregatedTotals.total.toString()],
      ["Total Refunds", aggregatedTotals.refunds.toString()],
      ["Cash Expected (gross)", aggregatedTotals.cash.toString()],
      ["Cash Expenses Paid Out", cashExpenses.toString()],
      ["Net Cash Expected", netCashExpected.toString()],
      ["Transfer / Mobile", aggregatedTotals.transfer.toString()],
      ...(showProfit
        ? [["Total Net Profit (Est.)", totalProfit.toString()]]
        : []),
      [],
      ["Payment Breakdown"],
      ["Method", "Amount"],
      ["Cash", aggregatedTotals.cash.toString()],
      ["Card / POS", aggregatedTotals.card.toString()],
      ...Object.values(aggregatedTotals.cardAccounts).map(a => [`  - ${a.name}`, a.total.toString()]),
      ["Transfer / Mobile", aggregatedTotals.transfer.toString()],
      ...Object.values(aggregatedTotals.transferAccounts).map(a => [`  - ${a.name}`, a.total.toString()]),
      ["Credit Sales", aggregatedTotals.credit.toString()],
      // Only emitted when non-zero: an unrecognized/legacy payment_method or
      // a mixed refund with no split data to prorate against - see totals.other.
      ...(aggregatedTotals.other !== 0 ? [["Other (uncategorized)", aggregatedTotals.other.toString()]] : []),
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
    returnsToday,
    aggregatedTotals,
    cashExpenses,
    totalProfit,
    netCashExpected,
    profitBreakdown,
    netCashBreakdown,
    topSellingMeds,
    exportToCSV,
  };
}
