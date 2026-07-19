"use client";

import { useQuery } from "@tanstack/react-query";
import { getFastMovers } from "@/lib/db/queries/inventory";

export function FastMovers() {
  const { data: fastMoversData, isLoading } = useQuery({
    queryKey: ['fastMovers'],
    queryFn: () => getFastMovers()
  });

  const fastMovers = fastMoversData || [];

  return (
    <div className="bg-card border border-border rounded-2xl p-5 flex flex-col">
      <div className="flex items-center justify-between mb-4">
        <div className="text-[15px] font-semibold">Fast movers</div>
        <div className="text-[12.5px] text-muted-foreground">Last 7 days</div>
      </div>
      <div className="flex flex-col">
        {isLoading ? (
          <div className="text-sm text-muted-foreground py-4 text-center">Loading...</div>
        ) : fastMovers.length === 0 ? (
          <div className="text-sm text-muted-foreground py-4 text-center">No sales data found for the last 7 days.</div>
        ) : (
          fastMovers.map((item: any, idx: number) => (
            <div key={item.id} className={`flex items-center gap-3 py-3 ${idx !== fastMovers.length - 1 ? 'border-b border-border' : ''}`}>
              <div className="w-6 text-[12.5px] font-bold text-muted-foreground">
                {(idx + 1).toString().padStart(2, '0')}
              </div>
              <div className="flex-1 min-w-0">
                <div className="text-[13px] font-semibold truncate">{item.product_name}</div>
                <div className="text-[11.5px] text-muted-foreground">{item.total_sold} units sold</div>
              </div>
              {/* Note: percentage change can be added later once history is fully supported */}
            </div>
          ))
        )}
      </div>
    </div>
  );
}
