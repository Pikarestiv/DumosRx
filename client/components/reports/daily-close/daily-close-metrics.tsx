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
    <div className="flex flex-col gap-5">
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <div 
          className="bg-background border rounded-[14px] p-5 shadow-sm cursor-pointer hover:bg-secondary/50 transition-colors"
          onClick={() => openSalesModal("all")}
        >
          <div className="text-[12.5px] text-muted-foreground font-medium mb-3">Total Sales</div>
          <div className="text-[22px] font-semibold font-['Playfair_Display']">
            {formatCurrency(aggregatedTotals.total, currencyCode)}
          </div>
        </div>
        
        <div 
          className="bg-background border rounded-[14px] p-5 shadow-sm cursor-pointer hover:bg-secondary/50 transition-colors"
          onClick={() => openSalesModal("cash")}
        >
          <div className="text-[12.5px] text-muted-foreground font-medium mb-3">Cash Expected</div>
          <div className="text-[22px] font-semibold font-['Playfair_Display']">
            {formatCurrency(aggregatedTotals.cash, currencyCode)}
          </div>
        </div>

        <div 
          className="bg-background border rounded-[14px] p-5 shadow-sm cursor-pointer hover:bg-secondary/50 transition-colors"
          onClick={() => openSalesModal("transfer")}
        >
          <div className="text-[12.5px] text-muted-foreground font-medium mb-3">Transfer / Mobile</div>
          <div className="text-[22px] font-semibold font-['Playfair_Display']">
            {formatCurrency(aggregatedTotals.transfer, currencyCode)}
          </div>
        </div>

        <div className="bg-destructive/10 border border-destructive/20 rounded-[14px] p-5">
          <div className="text-[12.5px] text-destructive font-medium mb-3">Total Refunds</div>
          <div className="text-[22px] font-semibold font-['Playfair_Display'] text-destructive">
            {formatCurrency(aggregatedTotals.refunds, currencyCode)}
          </div>
        </div>
      </div>

      <div className="bg-background border rounded-[14px] p-5">
        <div className="text-[12.5px] text-muted-foreground font-medium mb-2">Total Profit (Est.)</div>
        <div className={`text-[28px] font-bold font-['Playfair_Display'] ${totalProfit >= 0 ? "text-emerald-600" : "text-destructive"}`}>
          {formatCurrency(totalProfit, currencyCode)}
        </div>
      </div>
    </div>
  );
}
