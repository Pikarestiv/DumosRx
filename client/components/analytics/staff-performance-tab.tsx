"use client";

import { Card } from "@/components/ui/card";
import { Users } from "lucide-react";
import { formatCurrency } from "@/lib/utils";
import { SortableHeaderCell } from "@/components/ui/sortable-header-cell";
import { useSortableData } from "@/lib/hooks/use-sortable-data";

export interface CashierPerformanceRow {
  id: string;
  name: string;
  transactionCount: number;
  totalSales: number;
  avgTransaction: number;
}

interface StaffPerformanceTabProps {
  cashierPerformance: CashierPerformanceRow[];
}

type SortKey = "name" | "transactionCount" | "totalSales" | "avgTransaction";

export function StaffPerformanceTab({ cashierPerformance }: StaffPerformanceTabProps) {
  const { sortKey, direction, toggleSort, sortedData } = useSortableData<
    CashierPerformanceRow,
    SortKey
  >(cashierPerformance, {
    name: (c) => c.name.toLowerCase(),
    transactionCount: (c) => c.transactionCount,
    totalSales: (c) => c.totalSales,
    avgTransaction: (c) => c.avgTransaction,
  });

  return (
    <Card className="p-5 border shadow-sm rounded-2xl">
      <div className="mb-4">
        <div className="text-[14.5px] font-semibold">Staff Performance</div>
        <div className="text-[12px] text-muted-foreground">
          Sales rung up per cashier for the selected time range
        </div>
      </div>

      {sortedData.length === 0 ? (
        <div className="flex flex-col items-center justify-center text-muted-foreground h-32">
          <Users className="h-8 w-8 mb-2 opacity-50" />
          <p className="font-medium">No transactions in this period</p>
        </div>
      ) : (
        <div className="overflow-x-auto">
          <div role="table" aria-label="Staff performance" className="w-full min-w-[520px]">
            <div role="rowgroup">
              <div
                role="row"
                className="grid grid-cols-[1.4fr_1fr_1fr_1fr] gap-2 px-3 py-2 text-[11px] font-bold text-muted-foreground uppercase tracking-wide border-b border-border"
              >
                <SortableHeaderCell
                  label="Cashier"
                  active={sortKey === "name"}
                  direction={direction}
                  onClick={() => toggleSort("name")}
                />
                <SortableHeaderCell
                  label="Transactions"
                  active={sortKey === "transactionCount"}
                  direction={direction}
                  onClick={() => toggleSort("transactionCount")}
                  className="justify-end"
                />
                <SortableHeaderCell
                  label="Total Sales"
                  active={sortKey === "totalSales"}
                  direction={direction}
                  onClick={() => toggleSort("totalSales")}
                  className="justify-end"
                />
                <SortableHeaderCell
                  label="Avg Transaction"
                  active={sortKey === "avgTransaction"}
                  direction={direction}
                  onClick={() => toggleSort("avgTransaction")}
                  className="justify-end"
                />
              </div>
            </div>
            <div role="rowgroup" className="divide-y divide-border/50">
              {sortedData.map((c) => (
                <div
                  key={c.id}
                  role="row"
                  className="grid grid-cols-[1.4fr_1fr_1fr_1fr] gap-2 px-3 py-3 items-center text-[13px]"
                >
                  <div role="cell" className="font-semibold truncate">
                    {c.name || "Unknown"}
                  </div>
                  <div role="cell" className="text-right text-muted-foreground">
                    {c.transactionCount}
                  </div>
                  <div role="cell" className="text-right font-semibold">
                    {formatCurrency(c.totalSales)}
                  </div>
                  <div role="cell" className="text-right text-muted-foreground">
                    {formatCurrency(c.avgTransaction)}
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}
    </Card>
  );
}
