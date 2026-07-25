import { DollarSign, Banknote, ArrowLeftRight, RotateCcw, TrendingUp } from "lucide-react";
import { formatCurrency } from "@/lib/utils";
import { MetricCard } from "@/components/ui/metric-card";

interface DailyCloseMetricsProps {
  currencyCode?: string;
  aggregatedTotals: {
    total: number;
    cash: number;
    transfer: number;
    refunds: number;
  };
  totalProfit: number;
  openSalesModal: (filter: string) => void;
}

export function DailyCloseMetrics({
  currencyCode,
  aggregatedTotals,
  totalProfit,
  openSalesModal,
}: DailyCloseMetricsProps) {
  return (
    <div className="flex flex-col gap-5">
      <div className="-mx-4 sm:mx-0 px-4 sm:px-0">
        <div className="flex overflow-x-auto sm:grid sm:grid-cols-2 lg:grid-cols-4 gap-2 sm:gap-4 pb-4 sm:pb-0 hide-scrollbar snap-x snap-mandatory">
          <MetricCard
            className="min-w-[160px] sm:min-w-0 snap-center shrink-0 border-border"
            title="Total Sales"
            value={formatCurrency(aggregatedTotals.total, currencyCode)}
            icon={<DollarSign className="h-4 w-4" />}
            iconBgClass="bg-blue-50 text-blue-700"
            valueClassName="font-serif"
            onClick={() => openSalesModal("all")}
          />
          <MetricCard
            className="min-w-[160px] sm:min-w-0 snap-center shrink-0 border-border"
            title="Cash Expected"
            value={formatCurrency(aggregatedTotals.cash, currencyCode)}
            icon={<Banknote className="h-4 w-4" />}
            iconBgClass="bg-emerald-50 text-emerald-700"
            valueClassName="font-serif"
            onClick={() => openSalesModal("cash")}
          />
          <MetricCard
            className="min-w-[160px] sm:min-w-0 snap-center shrink-0 border-border"
            title="Transfer / Mobile"
            value={formatCurrency(aggregatedTotals.transfer, currencyCode)}
            icon={<ArrowLeftRight className="h-4 w-4" />}
            iconBgClass="bg-sky-50 text-sky-700"
            valueClassName="font-serif"
            onClick={() => openSalesModal("transfer")}
          />
          <MetricCard
            className="min-w-[160px] sm:min-w-0 snap-center shrink-0 border-red-200/50 hover:border-red-500/50"
            title="Total Refunds"
            value={formatCurrency(aggregatedTotals.refunds, currencyCode)}
            icon={<RotateCcw className="h-4 w-4" />}
            iconBgClass="bg-red-50 text-red-700"
            valueClassName="font-serif text-red-700"
            descriptionClassName="text-red-700/70"
          />
        </div>
      </div>

      <MetricCard
        className="border-emerald-200/50"
        title="Total Profit (Est.)"
        value={formatCurrency(totalProfit, currencyCode)}
        icon={<TrendingUp className="h-4 w-4" />}
        iconBgClass={totalProfit >= 0 ? "bg-emerald-50 text-emerald-700" : "bg-red-50 text-red-700"}
        valueClassName={`font-serif ${totalProfit >= 0 ? "text-emerald-600" : "text-destructive"}`}
      />
    </div>
  );
}
