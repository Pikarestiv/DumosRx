import { DollarSign, TrendingUp, TrendingDown, Receipt, Package, Users } from "lucide-react";
import { cn, formatMetricCurrency } from "@/lib/utils";
import { MetricCard } from "@/components/ui/metric-card";
import { useStore } from "@/lib/context/store-context";

interface BIKeyMetricsProps {
  totalRevenue: number;
  totalTransactions: number;
  stock_batchValue: number;
  activeCustomers: number;
  netProfit: number;
}

export function BIKeyMetrics({
  totalRevenue,
  totalTransactions,
  stock_batchValue,
  activeCustomers,
  netProfit,
}: BIKeyMetricsProps) {
  const { storeProfile } = useStore();
  const currencyCode = storeProfile?.currency;
  const isProfitable = netProfit >= 0;
  return (
    <div className="flex flex-col gap-5">
      <div className="-mx-4 sm:mx-0 px-4 sm:px-0">
        <div className="flex overflow-x-auto sm:grid sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-2 sm:gap-4 pb-4 sm:pb-0 hide-scrollbar snap-x snap-mandatory">
          <MetricCard
            className="min-w-[180px] sm:min-w-0 snap-center shrink-0 border-primary/20 hover:border-primary/40"
            title="Net Sales"
            value={formatMetricCurrency(totalRevenue, currencyCode)}
            icon={<DollarSign className="h-4 w-4" />}
            iconBgClass="bg-primary/10 text-primary"
            valueClassName="font-serif"
            description="After discounts, tax & refunds"
          />
          <MetricCard
            className={cn(
              "min-w-[180px] sm:min-w-0 snap-center shrink-0",
              isProfitable
                ? "border-emerald-200/50 hover:border-emerald-500/50"
                : "border-red-200/50 hover:border-red-500/50",
            )}
            title="Net Profit"
            value={formatMetricCurrency(netProfit, currencyCode)}
            icon={isProfitable ? <TrendingUp className="h-4 w-4" /> : <TrendingDown className="h-4 w-4" />}
            iconBgClass={isProfitable ? "bg-emerald-50 text-emerald-700" : "bg-red-50 text-red-700"}
            valueClassName={cn("font-serif", isProfitable ? "text-emerald-600" : "text-red-600")}
            description="After COGS & expenses"
          />
          <MetricCard
            className="min-w-[180px] sm:min-w-0 snap-center shrink-0 border-border"
            title="Transactions"
            value={totalTransactions.toLocaleString()}
            icon={<Receipt className="h-4 w-4" />}
            iconBgClass="bg-sky-50 text-sky-700"
            valueClassName="font-serif"
            description="Volume"
          />
          <MetricCard
            className="min-w-[180px] sm:min-w-0 snap-center shrink-0 border-border"
            title="Stock Batch Value"
            value={formatMetricCurrency(stock_batchValue, currencyCode)}
            icon={<Package className="h-4 w-4" />}
            iconBgClass="bg-blue-50 text-blue-700"
            valueClassName="font-serif"
            description="Asset value (cost)"
          />
          <MetricCard
            className="min-w-[180px] sm:min-w-0 snap-center shrink-0 border-border"
            title="Customers"
            value={activeCustomers.toLocaleString()}
            icon={<Users className="h-4 w-4" />}
            iconBgClass="bg-violet-50 text-violet-700"
            valueClassName="font-serif"
            description="Active base"
          />
        </div>
      </div>
    </div>
  );
}
