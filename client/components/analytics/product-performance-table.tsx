"use client";

import { Card } from "@/components/ui/card";
import { TrendingUp } from "lucide-react";
import { formatCurrency } from "@/lib/utils";
import { SortableHeaderCell } from "@/components/ui/sortable-header-cell";
import { useSortableData } from "@/lib/hooks/use-sortable-data";
import { useStore } from "@/lib/context/store-context";
import { EmptyReportState } from "@/components/reports/empty-report-state";

export interface ProductPerformanceRow {
  id: string;
  name: string;
  category: string;
  revenue: number;
  units: number;
  cost: number;
  margin: number;
}

interface ProductPerformanceTableProps {
  products: ProductPerformanceRow[];
}

type SortKey = "name" | "category" | "revenue" | "units" | "margin";

/** Full, sortable product performance breakdown for the selected time
 * range - replaces the old top-5-only "Top Selling Products" list so
 * underperformers (not just the winners) are visible too. */
export function ProductPerformanceTable({ products }: ProductPerformanceTableProps) {
  const { storeProfile } = useStore();
  const currencyCode = storeProfile?.currency;
  const { sortKey, direction, toggleSort, sortedData } = useSortableData<
    ProductPerformanceRow,
    SortKey
  >(products, {
    name: (p) => p.name.toLowerCase(),
    category: (p) => p.category.toLowerCase(),
    revenue: (p) => p.revenue,
    units: (p) => p.units,
    margin: (p) => p.margin,
  });

  return (
    <Card className="p-5 border shadow-sm rounded-2xl lg:col-span-2">
      <div className="mb-4">
        <div className="text-[14.5px] font-semibold">Product Performance</div>
        <div className="text-[12px] text-muted-foreground">
          Every product sold this period - click a column to sort
        </div>
      </div>

      {sortedData.length === 0 ? (
        <EmptyReportState icon={TrendingUp} description="No sales data available for the selected filters." />
      ) : (
        <div className="overflow-x-auto">
          <div role="table" aria-label="Product performance" className="w-full min-w-[560px]">
            <div role="rowgroup">
              <div
                role="row"
                className="grid grid-cols-[1.6fr_1fr_90px_90px_90px] gap-2 px-3 py-2 text-[11px] font-bold text-muted-foreground uppercase tracking-wide border-b border-border"
              >
                <SortableHeaderCell
                  label="Product"
                  active={sortKey === "name"}
                  direction={direction}
                  onClick={() => toggleSort("name")}
                />
                <SortableHeaderCell
                  label="Category"
                  active={sortKey === "category"}
                  direction={direction}
                  onClick={() => toggleSort("category")}
                />
                <SortableHeaderCell
                  label="Revenue"
                  active={sortKey === "revenue"}
                  direction={direction}
                  onClick={() => toggleSort("revenue")}
                  className="justify-end"
                />
                <SortableHeaderCell
                  label="Units"
                  active={sortKey === "units"}
                  direction={direction}
                  onClick={() => toggleSort("units")}
                  className="justify-end"
                />
                <SortableHeaderCell
                  label="Margin"
                  active={sortKey === "margin"}
                  direction={direction}
                  onClick={() => toggleSort("margin")}
                  className="justify-end"
                />
              </div>
            </div>
            <div role="rowgroup" className="divide-y divide-border/50 max-h-[420px] overflow-y-auto">
              {sortedData.map((p) => (
                <div
                  key={p.id}
                  role="row"
                  className="grid grid-cols-[1.6fr_1fr_90px_90px_90px] gap-2 px-3 py-2.5 items-center text-[13px]"
                >
                  <div role="cell" className="font-medium truncate">
                    {p.name}
                  </div>
                  <div role="cell" className="text-muted-foreground truncate">
                    {p.category}
                  </div>
                  <div role="cell" className="text-right font-semibold">
                    {formatCurrency(p.revenue, currencyCode)}
                  </div>
                  <div role="cell" className="text-right text-muted-foreground">
                    {p.units}
                  </div>
                  <div
                    role="cell"
                    className={`text-right font-semibold ${p.margin >= 0 ? "text-emerald-600" : "text-destructive"}`}
                  >
                    {p.margin.toFixed(0)}%
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
