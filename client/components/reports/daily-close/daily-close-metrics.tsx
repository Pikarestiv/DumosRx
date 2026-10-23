import {
  Receipt,
  Banknote,
  ArrowLeftRight,
  RotateCcw,
  TrendingUp,
  Wallet,
  PiggyBank,
} from "lucide-react";
import { useState } from "react";
import { formatMetricCurrency } from "@/lib/utils";
import { DAILY_CLOSE_PROFIT_AFTER_EXPENSES_LABEL, DAILY_CLOSE_PROFIT_LABEL, type FigureBreakdown } from "@/lib/utils/daily-close-breakdown";
import { FigureBreakdownModal } from "./figure-breakdown-modal";
import { MetricCard } from "@/components/ui/metric-card";
import { HorizontalScrollFade } from "@/components/ui/scroll-fade";

interface DailyCloseMetricsProps {
  currencyCode?: string;
  aggregatedTotals: {
    total: number;
    cash: number;
    transfer: number;
    refunds: number;
  };
  cashExpenses: number;
  netCashBreakdown: FigureBreakdown;
  profitBreakdown: FigureBreakdown;
  profitAfterExpensesBreakdown: FigureBreakdown;
  openSalesModal: (filter: string) => void;
  showProfit?: boolean;
}

export function DailyCloseMetrics({
  currencyCode,
  aggregatedTotals,
  cashExpenses,
  netCashBreakdown,
  profitBreakdown,
  profitAfterExpensesBreakdown,
  openSalesModal,
  showProfit = true,
}: DailyCloseMetricsProps) {
  const [openBreakdown, setOpenBreakdown] = useState<"netCash" | "profit" | "profitAfterExpenses" | null>(null);
  const closeBreakdown = (open: boolean) => !open && setOpenBreakdown(null);
  const totalProfit = profitBreakdown.total;
  const profitAfterExpenses = profitAfterExpensesBreakdown.total;
  const profitTone = (value: number) =>
    value >= 0
      ? { icon: "bg-emerald-50 text-emerald-700", value: "font-serif text-emerald-600" }
      : { icon: "bg-red-50 text-red-700", value: "font-serif text-destructive" };
  return (
    <div className="flex flex-col gap-5">
      <div className="-mx-4 sm:mx-0 px-4 sm:px-0">
        <HorizontalScrollFade className="flex overflow-x-auto sm:grid sm:grid-cols-2 lg:grid-cols-4 gap-2 sm:gap-4 pb-4 sm:pb-0 hide-scrollbar snap-x snap-mandatory">
          <MetricCard
            className="min-w-[180px] sm:min-w-0 snap-center shrink-0 border-border"
            title="Total Sales"
            value={formatMetricCurrency(aggregatedTotals.total, currencyCode)}
            icon={<Receipt className="h-4 w-4" />}
            iconBgClass="bg-blue-50 text-blue-700"
            valueClassName="font-serif"
            onClick={() => openSalesModal("all")}
          />
          <MetricCard
            className="min-w-[180px] sm:min-w-0 snap-center shrink-0 border-border"
            title="Cash Expected"
            value={formatMetricCurrency(aggregatedTotals.cash, currencyCode)}
            icon={<Banknote className="h-4 w-4" />}
            iconBgClass="bg-emerald-50 text-emerald-700"
            valueClassName="font-serif"
            onClick={() => openSalesModal("cash")}
          />
          <MetricCard
            className="min-w-[180px] sm:min-w-0 snap-center shrink-0 border-border"
            title="Transfer / Mobile"
            value={formatMetricCurrency(
              aggregatedTotals.transfer,
              currencyCode,
            )}
            icon={<ArrowLeftRight className="h-4 w-4" />}
            iconBgClass="bg-sky-50 text-sky-700"
            valueClassName="font-serif"
            onClick={() => openSalesModal("transfer")}
          />
          <MetricCard
            className="min-w-[180px] sm:min-w-0 snap-center shrink-0 border-red-200/50 hover:border-red-500/50"
            title="Total Refunds"
            onClick={() => openSalesModal("refunds")}
            value={formatMetricCurrency(aggregatedTotals.refunds, currencyCode)}
            icon={<RotateCcw className="h-4 w-4" />}
            iconBgClass="bg-red-50 text-red-700"
            valueClassName="font-serif text-red-700"
            descriptionClassName="text-red-700/70"
          />
        </HorizontalScrollFade>
      </div>

      <div className={`grid grid-cols-1 sm:grid-cols-2 gap-2 sm:gap-4${showProfit ? " lg:grid-cols-3" : ""}`}>
        <MetricCard
          className="border-emerald-200/50"
          title="Net Cash Expected"
          value={formatMetricCurrency(netCashBreakdown.total, currencyCode)}
          description={`Cash sales minus ${formatMetricCurrency(cashExpenses, currencyCode)} paid out today`}
          icon={<Wallet className="h-4 w-4" />}
          iconBgClass="bg-emerald-50 text-emerald-700"
          valueClassName="font-serif"
          onClick={() => setOpenBreakdown("netCash")}
        />

        {showProfit && (
        <MetricCard
          className="border-emerald-200/50"
          title={DAILY_CLOSE_PROFIT_LABEL}
          value={formatMetricCurrency(totalProfit, currencyCode)}
          icon={<TrendingUp className="h-4 w-4" />}
          iconBgClass={profitTone(totalProfit).icon}
          valueClassName={profitTone(totalProfit).value}
          onClick={() => setOpenBreakdown("profit")}
        />
        )}

        {showProfit && (
        <MetricCard
          className="border-emerald-200/50"
          title={DAILY_CLOSE_PROFIT_AFTER_EXPENSES_LABEL}
          value={formatMetricCurrency(profitAfterExpenses, currencyCode)}
          description="Spread expenses count one day's share"
          icon={<PiggyBank className="h-4 w-4" />}
          iconBgClass={profitTone(profitAfterExpenses).icon}
          valueClassName={profitTone(profitAfterExpenses).value}
          onClick={() => setOpenBreakdown("profitAfterExpenses")}
        />
        )}
      </div>

      <FigureBreakdownModal
        open={openBreakdown === "netCash"}
        onOpenChange={closeBreakdown}
        title="Net Cash Expected"
        description="The cash that should be in the drawer from today's trading."
        breakdown={netCashBreakdown}
        totalLabel="Net cash expected"
        footnote="Card, transfer and credit sales never reach the drawer, so they are left out. Cash sales include the cash part of split payments."
        currencyCode={currencyCode}
      />
      {showProfit && (
        <FigureBreakdownModal
          open={openBreakdown === "profit"}
          onOpenChange={closeBreakdown}
          title={DAILY_CLOSE_PROFIT_LABEL}
          description="What today's sales earned after the cost of the goods sold."
          breakdown={profitBreakdown}
          totalLabel={DAILY_CLOSE_PROFIT_LABEL}
          footnote={`Expenses such as rent, salaries or power are not deducted from this figure; see ${DAILY_CLOSE_PROFIT_AFTER_EXPENSES_LABEL} for that. Cost uses the cost price recorded on each sale line.`}
          currencyCode={currencyCode}
        />
      )}
      {showProfit && (
        <FigureBreakdownModal
          open={openBreakdown === "profitAfterExpenses"}
          onOpenChange={closeBreakdown}
          title={DAILY_CLOSE_PROFIT_AFTER_EXPENSES_LABEL}
          description="Profit before expenses, minus the expenses that belong to this day."
          breakdown={profitAfterExpensesBreakdown}
          totalLabel={DAILY_CLOSE_PROFIT_AFTER_EXPENSES_LABEL}
          footnote="Every expense dated this day counts in full, however it was paid, unless it is spread. An expense spread over several months (such as rent paid for a quarter) counts only one day's share of its monthly amount, on every day of the months it covers. The Expenses link lists expenses dated this day, so a spread expense entered on another date is not in that list, and one dated this day appears there at its full amount."
          currencyCode={currencyCode}
        />
      )}
    </div>
  );
}
