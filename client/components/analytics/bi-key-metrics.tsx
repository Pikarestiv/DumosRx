import { formatCurrency } from "@/lib/utils";

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
  return (
    <div className="flex flex-col gap-5">
      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-4 mb-5">
        <div className="bg-primary/10 border border-primary/20 rounded-[14px] p-[18px] px-5">
          <div className="text-[12px] text-primary font-medium mb-3">Total Revenue</div>
          <div className="text-[19px] font-semibold font-['Playfair_Display']">{formatCurrency(totalRevenue)}</div>
          <div className="text-[11px] text-muted-foreground mt-1">Gross billings</div>
        </div>
        <div className="bg-emerald-500/10 border border-emerald-500/20 rounded-[14px] p-[18px] px-5">
          <div className="text-[12px] text-emerald-600 font-medium mb-3">Net Profit</div>
          <div className="text-[19px] font-semibold font-['Playfair_Display'] text-emerald-600">{formatCurrency(netProfit)}</div>
          <div className="text-[11px] text-muted-foreground mt-1">After COGS & expenses</div>
        </div>
        <div className="bg-background border rounded-[14px] p-[18px] px-5">
          <div className="text-[12px] text-muted-foreground font-medium mb-3">Transactions</div>
          <div className="text-[19px] font-semibold font-['Playfair_Display']">{totalTransactions.toLocaleString()}</div>
          <div className="text-[11px] text-muted-foreground mt-1">Volume</div>
        </div>
        <div className="bg-background border rounded-[14px] p-[18px] px-5">
          <div className="text-[12px] text-muted-foreground font-medium mb-3">Stock Batch Value</div>
          <div className="text-[19px] font-semibold font-['Playfair_Display']">{formatCurrency(stock_batchValue)}</div>
          <div className="text-[11px] text-muted-foreground mt-1">Asset value (cost)</div>
        </div>
        <div className="bg-background border rounded-[14px] p-[18px] px-5">
          <div className="text-[12px] text-muted-foreground font-medium mb-3">Customers</div>
          <div className="text-[19px] font-semibold font-['Playfair_Display']">{activeCustomers.toLocaleString()}</div>
          <div className="text-[11px] text-muted-foreground mt-1">Active base</div>
        </div>
      </div>
    </div>
  );
}
