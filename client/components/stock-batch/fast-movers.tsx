"use client";

import { useQuery } from "@tanstack/react-query";
import { getFastMovers } from "@/lib/db/queries/inventory";

import { TrendingUp, TrendingDown } from "lucide-react";

export function FastMovers() {
  const { data: fastMoversData, isLoading } = useQuery({
    queryKey: ['fastMovers'],
    queryFn: () => getFastMovers()
  });

  const fastMovers = fastMoversData?.items || [];

  const header = (
    <div className="flex items-center justify-between">
      <div className="text-[15px] font-semibold">Fast movers</div>
      <div className="text-[12.5px] text-muted-foreground">Last 7 days</div>
    </div>
  );

  return (
    <div className="flex flex-col lg:h-full">
      {/* Mobile: header sits above the card */}
      <div className="lg:hidden mb-3">{header}</div>

      <div className="border-0 md:border md:border-border bg-transparent md:bg-card rounded-none md:rounded-2xl p-0 md:p-5 flex flex-col lg:flex-1">
        {/* Desktop: header stays inside the card */}
        <div className="hidden lg:block mb-4">{header}</div>

        <div className="flex flex-col gap-2 md:gap-0 py-3 md:py-0">
        {!!(isLoading) && (
                        <div className="text-sm text-muted-foreground py-4 text-center">Loading...</div>
                      )}
              {(!(isLoading) && fastMovers.length === 0) && (
                                      <div className="text-sm text-muted-foreground py-4 text-center">No sales data found for the last 7 days.</div>
                                    )}
              {!(!(isLoading) && fastMovers.length === 0) && (
                                      fastMovers.map((item: any, idx: number) => {
                                        const isPositive = item.percentageChange >= 0;
                                        return (
                                          <div key={item.id} className={`flex items-center gap-3 p-3 md:py-3 md:px-0 rounded-xl md:rounded-none border md:border-0 border-border bg-card md:bg-transparent ${idx !== fastMovers.length - 1 ? 'md:border-b md:border-border' : ''}`}>
                                            <div className="w-6 text-[12.5px] font-bold text-muted-foreground">
                                              {(idx + 1).toString().padStart(2, '0')}
                                            </div>
                                            <div className="flex-1 min-w-0">
                                              <div className="text-[13px] font-semibold truncate">{item.name}</div>
                                              <div className="text-[11.5px] text-muted-foreground">{item.soldQuantity} units sold</div>
                                            </div>
                                            <div className={`px-2 py-0.5 rounded flex items-center text-[11.5px] font-medium ${isPositive ? 'bg-emerald-50 text-emerald-600 dark:bg-emerald-500/10 dark:text-emerald-400' : 'bg-red-50 text-red-600 dark:bg-red-500/10 dark:text-red-400'}`}>
                                              {!!(isPositive) && <TrendingUp className="h-3 w-3 mr-1" />}
                                                    {!(isPositive) && <TrendingDown className="h-3 w-3 mr-1" />}
                                              {Math.abs(item.percentageChange).toFixed(0)}%
                                            </div>
                                          </div>
                                        );
                                      })
                                    )}
        </div>
      </div>
    </div>
  );
}
