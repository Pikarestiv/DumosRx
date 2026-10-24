"use client";

import { Search, Lock } from "lucide-react";
import { DateRangePicker, type DateRangeValue } from "@/components/ui/date-range-picker";
import { SortableHeaderCell } from "@/components/ui/sortable-header-cell";
import type { SortDirection } from "@/lib/hooks/use-sortable-data";
import { StockMovementTypeFilter } from "./stock-movement-type-filter";

export type MovementSortKey = "date" | "product" | "type" | "quantity" | "reference" | "user";

export const RECENT_ACTIVITY_WINDOW_DAYS = 30;

interface StockMovementsFiltersProps {
  searchTerm: string;
  setSearchTerm: (value: string) => void;
  typeFilter: string;
  setTypeFilter: (value: string) => void;
  dateRange: DateRangeValue;
  setDateRange: (value: DateRangeValue) => void;
  hasFullHistory: boolean;
}

export function StockMovementsMobileFilters({
  searchTerm,
  setSearchTerm,
  typeFilter,
  setTypeFilter,
  dateRange,
  setDateRange,
  hasFullHistory,
}: StockMovementsFiltersProps) {
  return (
    <div className="space-y-3 mb-4">
      <div className="flex items-center gap-2 bg-card border border-border rounded-[10px] px-3.5 py-2.5">
        <Search className="w-4 h-4 text-muted-foreground/70 shrink-0" />
        <input
          type="text"
          placeholder="Search by product, reference, or user"
          className="border-0 outline-none text-[13px] w-full bg-transparent"
          value={searchTerm}
          onChange={(e) => setSearchTerm(e.target.value)}
        />
      </div>
      <div className="flex items-center gap-2">
        <StockMovementTypeFilter
          typeFilter={typeFilter}
          setTypeFilter={setTypeFilter}
          className="flex-1 h-9 text-[13px] bg-card border-border"
        />
        <DateRangePicker value={dateRange} onChange={setDateRange} className="flex-1" />
      </div>
      {dateRange.from && (
        <button
          onClick={() => setDateRange({})}
          className="text-[11.5px] text-muted-foreground hover:text-foreground underline px-0.5"
        >
          Clear date range
        </button>
      )}
      {!hasFullHistory && !dateRange.from && (
        <p className="text-[11.5px] text-muted-foreground/70 px-0.5">
          Showing last {RECENT_ACTIVITY_WINDOW_DAYS} days. Search or select
          a date range to look further back.
        </p>
      )}
    </div>
  );
}

export function StockMovementsDesktopFilters({
  searchTerm,
  setSearchTerm,
  typeFilter,
  setTypeFilter,
  dateRange,
  setDateRange,
  hasFullHistory,
}: StockMovementsFiltersProps) {
  return (
    <div className="p-4 pb-3 border-b border-border">
      <div className="flex items-center gap-2 bg-muted/30 border border-border rounded-[10px] px-3.5 py-2.5 mb-3">
        <Search className="w-4 h-4 text-muted-foreground/70 shrink-0" />
        <input
          type="text"
          placeholder="Search by product, reference, or user"
          className="border-0 outline-none text-[13px] w-full bg-transparent"
          value={searchTerm}
          onChange={(e) => setSearchTerm(e.target.value)}
        />
      </div>
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <StockMovementTypeFilter
            typeFilter={typeFilter}
            setTypeFilter={setTypeFilter}
            className="w-[150px] h-9 text-[13px] bg-muted/30 border-border"
          />
          <DateRangePicker value={dateRange} onChange={setDateRange} className="bg-muted/30 border-border" />
        </div>
        <div className="flex items-center gap-3 shrink-0">
          <div className="flex items-center gap-1.5 text-[11.5px] text-muted-foreground/70 whitespace-nowrap">
            <Lock className="w-3.5 h-3.5" />
            Immutable log, entries can&apos;t be edited
          </div>
        </div>
      </div>
      {dateRange.from && (
        <button
          onClick={() => setDateRange({})}
          className="text-[11.5px] text-muted-foreground hover:text-foreground underline mt-2"
        >
          Clear date range
        </button>
      )}
      {!hasFullHistory && !dateRange.from && (
        <p className="text-[11.5px] text-muted-foreground/70 mt-2">
          Showing last {RECENT_ACTIVITY_WINDOW_DAYS} days. Search or
          select a date range to look further back.
        </p>
      )}
    </div>
  );
}

const COLUMNS: { label: string; key: MovementSortKey }[] = [
  { label: "Time", key: "date" },
  { label: "Product", key: "product" },
  { label: "Type", key: "type" },
  { label: "Qty", key: "quantity" },
  { label: "Reference / Reason", key: "reference" },
  { label: "User", key: "user" },
];

export function StockMovementsGridHeader({
  sortKey,
  direction,
  toggleSort,
}: {
  sortKey: MovementSortKey | null;
  direction: SortDirection;
  toggleSort: (key: MovementSortKey) => void;
}) {
  return (
    <div className="grid grid-cols-[100px_minmax(0,1fr)_130px_100px_minmax(0,1fr)_120px] gap-2 px-4 py-2.5 text-[11px] font-bold text-muted-foreground/70 uppercase tracking-wide border-b border-border">
      {COLUMNS.map((col) => (
        <SortableHeaderCell
          key={col.key}
          label={col.label}
          active={sortKey === col.key}
          direction={direction}
          onClick={() => toggleSort(col.key)}
        />
      ))}
    </div>
  );
}
