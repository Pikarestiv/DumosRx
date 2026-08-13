"use client";

import {
  TrendingUp,
  TrendingDown,
  Clock,
  Activity
} from "lucide-react";
import { useStore } from "@/lib/context/store-context";
import { Card } from "@/components/ui/card";
import { MetricCard } from "@/components/ui/metric-card";
import { getCurrencyByCode } from "@/lib/constants/currencies";

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
  const symbol = getCurrencyByCode(currency).symbol;

  return (
    <div className="flex flex-col gap-5">
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 sm:gap-5">
        {customerMetrics.map((metric) => {
          const isUp = metric.trend === "up";
          return (
            <MetricCard
              key={metric.metric}
              title={metric.metric}
              value={metric.value}
              valueClassName="font-serif"
              icon={<Activity className="w-4 h-4" />}
              iconBgClass={isUp ? "bg-emerald-50 text-emerald-600" : "bg-red-50 text-red-600"}
              className={isUp ? "border-emerald-100" : "border-red-100"}
              description={
                <div className={`flex items-center gap-1 flex-wrap ${isUp ? "text-emerald-600" : "text-red-600"}`}>
                  {isUp ? <TrendingUp className="w-3.5 h-3.5" /> : <TrendingDown className="w-3.5 h-3.5" />}
                  <span>{metric.change}</span>
                  <span className="text-muted-foreground font-medium">vs last period</span>
                </div>
              }
            />
          );
        })}
      </div>

      <Card className="p-5 border shadow-sm rounded-2xl">
        <div>
          <div className="flex items-center gap-2 mb-0.5">
            <Clock className="w-4 h-4 text-primary" />
            <div className="text-[14.5px] font-semibold">Customer Purchase Patterns</div>
          </div>
          <div className="text-[12px] text-muted-foreground">Peak hours and transaction frequency based on real sales data</div>
        </div>

        {purchasePatterns.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-12 text-muted-foreground">
            <Clock className="h-10 w-10 opacity-20 mb-3" />
            <p className="font-semibold text-[13.5px]">No transaction data available</p>
            <p className="text-[12px] mt-1">Sales will appear here once transactions are recorded.</p>
          </div>
        ) : (
          <div className="w-full overflow-x-auto border rounded-xl">
            {/* Div-based table — ARIA roles stand in for real <table> semantics */}
            <div role="table" aria-label="Customer purchase patterns" className="w-full text-[13px] text-left">
              <div role="rowgroup">
                <div role="row" className="grid grid-cols-4 bg-primary/5 border-b text-primary font-semibold text-[11.5px] uppercase">
                  <div role="columnheader" className="px-5 py-3">Time Period</div>
                  <div role="columnheader" className="px-5 py-3">Transactions</div>
                  <div role="columnheader" className="px-5 py-3">Avg. Value</div>
                  <div role="columnheader" className="px-5 py-3">Top Category</div>
                </div>
              </div>
              <div role="rowgroup" className="divide-y divide-border">
                {purchasePatterns.map((row) => (
                  <div key={row.slot} role="row" className="grid grid-cols-4 hover:bg-primary/5">
                    <div role="cell" className="px-5 py-3.5 font-medium">{row.slot}</div>
                    <div role="cell" className="px-5 py-3.5">{row.transactions.toLocaleString()}</div>
                    <div role="cell" className="px-5 py-3.5">
                      {symbol}{Math.round(row.avgValue).toLocaleString()}
                    </div>
                    <div role="cell" className="px-5 py-3.5">{row.topCategory}</div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}
      </Card>
    </div>
  );
}
