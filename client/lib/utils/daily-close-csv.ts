import { formatDateToDDMMYYYY } from "@/lib/utils/date-utils";
import { DAILY_CLOSE_PROFIT_AFTER_EXPENSES_LABEL, DAILY_CLOSE_PROFIT_LABEL } from "@/lib/utils/daily-close-breakdown";

export interface DailyCloseCSVExportParams {
  aggregatedTotals: {
    total: number;
    refunds: number;
    cash: number;
    transfer: number;
    card: number;
    credit: number;
    other: number;
    cardAccounts: Record<string, { name: string; total: number }>;
    transferAccounts: Record<string, { name: string; total: number }>;
  };
  cashExpenses: number;
  netCashExpected: number;
  showProfit: boolean;
  totalProfit: number;
  profitAfterExpenses: number;
  topSellingMeds: Array<{ name: string; quantity: number; revenue: number }>;
}

export function exportDailyCloseToCSV({
  aggregatedTotals,
  cashExpenses,
  netCashExpected,
  showProfit,
  totalProfit,
  profitAfterExpenses,
  topSellingMeds,
}: DailyCloseCSVExportParams): void {
  const csvContent = [
    ["Daily Close Report", `Generated: ${formatDateToDDMMYYYY(new Date())}`],
    ["Total Net Sales", aggregatedTotals.total.toString()],
    ["Total Refunds", aggregatedTotals.refunds.toString()],
    ["Cash Expected (gross)", aggregatedTotals.cash.toString()],
    ["Cash Expenses Paid Out", cashExpenses.toString()],
    ["Net Cash Expected", netCashExpected.toString()],
    ["Transfer / Mobile", aggregatedTotals.transfer.toString()],
    ...(showProfit
      ? [
          [DAILY_CLOSE_PROFIT_LABEL, totalProfit.toString()],
          [DAILY_CLOSE_PROFIT_AFTER_EXPENSES_LABEL, profitAfterExpenses.toString()],
        ]
      : []),
    [],
    ["Payment Breakdown"],
    ["Method", "Amount"],
    ["Cash", aggregatedTotals.cash.toString()],
    ["Card / POS", aggregatedTotals.card.toString()],
    ...Object.values(aggregatedTotals.cardAccounts).map((a) => [`  - ${a.name}`, a.total.toString()]),
    ["Transfer / Mobile", aggregatedTotals.transfer.toString()],
    ...Object.values(aggregatedTotals.transferAccounts).map((a) => [`  - ${a.name}`, a.total.toString()]),
    ["Credit Sales", aggregatedTotals.credit.toString()],
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
}
