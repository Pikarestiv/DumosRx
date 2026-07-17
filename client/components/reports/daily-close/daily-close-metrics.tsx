import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { ArrowRight } from "lucide-react";
import { formatCurrency } from "@/lib/utils";

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
    <div className="-mx-4 sm:mx-0 px-4 sm:px-0">
      <div className="flex overflow-x-auto sm:grid sm:grid-cols-2 lg:grid-cols-4 gap-[10px] sm:gap-4 pb-4 sm:pb-0 hide-scrollbar snap-x snap-mandatory">
        <Card
          className="min-w-[140px] sm:min-w-0 snap-center shrink-0 border-border cursor-pointer hover:bg-muted/50 transition-colors"
          onClick={() => openSalesModal("all")}
        >
          <CardHeader className="pb-2 flex flex-row items-center justify-between space-y-0">
            <CardTitle className="text-xs sm:text-sm font-medium text-muted-foreground">
              Total Sales
            </CardTitle>
            <ArrowRight className="h-4 w-4 text-muted-foreground shrink-0" />
          </CardHeader>
          <CardContent>
            <div className="text-xl sm:text-2xl font-bold">
              {formatCurrency(aggregatedTotals.total, currencyCode)}
            </div>
          </CardContent>
        </Card>
        <Card
          className="min-w-[140px] sm:min-w-0 snap-center shrink-0 border-border cursor-pointer hover:bg-muted/50 transition-colors"
          onClick={() => openSalesModal("cash")}
        >
          <CardHeader className="pb-2 flex flex-row items-center justify-between space-y-0">
            <CardTitle className="text-xs sm:text-sm font-medium text-muted-foreground">
              Cash Expected
            </CardTitle>
            <ArrowRight className="h-4 w-4 text-muted-foreground shrink-0" />
          </CardHeader>
          <CardContent>
            <div className="text-xl sm:text-2xl font-bold">
              {formatCurrency(aggregatedTotals.cash, currencyCode)}
            </div>
          </CardContent>
        </Card>
        <Card
          className="min-w-[140px] sm:min-w-0 snap-center shrink-0 border-border cursor-pointer hover:bg-muted/50 transition-colors"
          onClick={() => openSalesModal("transfer")}
        >
          <CardHeader className="pb-2 flex flex-row items-center justify-between space-y-0">
            <CardTitle className="text-xs sm:text-sm font-medium text-muted-foreground">
              Transfer / Mobile
            </CardTitle>
            <ArrowRight className="h-4 w-4 text-muted-foreground shrink-0" />
          </CardHeader>
          <CardContent>
            <div className="text-xl sm:text-2xl font-bold">
              {formatCurrency(aggregatedTotals.transfer, currencyCode)}
            </div>
          </CardContent>
        </Card>
        <Card className="min-w-[140px] sm:min-w-0 snap-center shrink-0 border-border bg-destructive/5">
          <CardHeader className="pb-2">
            <CardTitle className="text-xs sm:text-sm font-medium text-destructive">
              Total Refunds
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-xl sm:text-2xl font-bold text-destructive">
              {formatCurrency(aggregatedTotals.refunds, currencyCode)}
            </div>
          </CardContent>
        </Card>
        <Card className="min-w-[140px] sm:min-w-0 snap-center shrink-0 border-border bg-muted/30 lg:col-span-4">
          <CardHeader className="pb-2">
            <CardTitle className="text-xs sm:text-sm font-medium text-muted-foreground">
              Total Profit (Est.)
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div
              className={`text-xl sm:text-2xl font-bold ${totalProfit >= 0 ? "text-green-600" : "text-red-600"}`}
            >
              {formatCurrency(totalProfit, currencyCode)}
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
