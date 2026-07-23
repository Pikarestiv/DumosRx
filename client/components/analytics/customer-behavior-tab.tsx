"use client";

import { 
  TrendingUp, 
  TrendingDown,
  Clock
} from "lucide-react";
import { useStore } from "@/lib/context/store-context";

interface CustomerBehaviorTabProps {
  customerMetrics: {
    metric: string;
    value: string;
    change: string;
    trend: string;
  }[];
  purchasePatterns?: {
    slot: string;
    transactions: number;
    avgValue: number;
    topCategory: string;
  }[];
}

export function CustomerBehaviorTab({
  customerMetrics,
  purchasePatterns = [],
}: CustomerBehaviorTabProps) {
  const { storeProfile } = useStore();
  const currency = storeProfile?.currency || "NGN";
  const symbol = currency === "NGN" ? "₦" : currency === "USD" ? "$" : currency === "GBP" ? "£" : "₦";

  return (
    <div className="flex flex-col gap-5">
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-5">
        {customerMetrics.map((metric) => (
          <div key={metric.metric} className="bg-background border rounded-2xl p-5">
            <div className="text-[12px] text-muted-foreground mb-1">{metric.metric}</div>
            <div className="text-[24px] font-bold">{metric.value}</div>
            <div className={`flex items-center gap-1 mt-2 text-[11px] font-semibold ${metric.trend === "up" ? "text-emerald-600" : "text-red-600"}`}>
              {metric.trend === "up" ? (
                <TrendingUp className="w-3.5 h-3.5" />
              ) : (
                <TrendingDown className="w-3.5 h-3.5" />
              )}
              <span>{metric.change}</span>
              <span className="text-muted-foreground font-medium ml-1">vs last period</span>
            </div>
          </div>
        ))}
      </div>

      <div className="bg-background border rounded-2xl p-5">
        <div className="flex items-center gap-2 mb-0.5">
          <Clock className="w-4 h-4 text-primary" />
          <div className="text-[14.5px] font-semibold">Customer Purchase Patterns</div>
        </div>
        <div className="text-[12px] text-muted-foreground mb-5">Peak hours and transaction frequency based on real sales data</div>
        
        {purchasePatterns.length === 0 && (
          <div className="flex flex-col items-center justify-center py-12 text-muted-foreground">
            <Clock className="h-10 w-10 opacity-20 mb-3" />
            <p className="font-semibold text-[13.5px]">No transaction data available</p>
            <p className="text-[12px] mt-1">Sales will appear here once transactions are recorded.</p>
          </div>
        )}
        
        {purchasePatterns.length > 0 && (
          <div className="w-full overflow-hidden border rounded-xl">
            <table className="w-full text-[13px] text-left">
              <thead className="bg-secondary/50 border-b text-muted-foreground font-semibold text-[11.5px] uppercase">
                <tr>
                  <th className="px-5 py-3">Time Period</th>
                  <th className="px-5 py-3">Transactions</th>
                  <th className="px-5 py-3">Avg. Value</th>
                  <th className="px-5 py-3">Top Category</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {purchasePatterns.map((row) => (
                  <tr key={row.slot} className="hover:bg-muted/30">
                    <td className="px-5 py-3.5 font-medium">{row.slot}</td>
                    <td className="px-5 py-3.5">{row.transactions.toLocaleString()}</td>
                    <td className="px-5 py-3.5">
                      {symbol}{Math.round(row.avgValue).toLocaleString()}
                    </td>
                    <td className="px-5 py-3.5">{row.topCategory}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
