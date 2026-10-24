"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { Search, Star, X } from "lucide-react";
import { useVirtualizer } from "@tanstack/react-virtual";
import { Card } from "@/components/ui/card";
import { formatCurrency, formatDateTime } from "@/lib/utils";
import { genericFuzzySearch } from "@/lib/utils/search";
import { useCustomerTransactions } from "@/lib/hooks/use-customer-data";
import { usePullToRefreshHandler } from "@/lib/context/pull-to-refresh-context";
import { DateRangePicker } from "@/components/ui/date-range-picker";
import { useAuth } from "@/lib/context/auth-context";
import { useMediaQuery } from "@/hooks/use-media-query";
import { ScrollToTopButton } from "@/components/ui/scroll-to-top-button";
import { ActivityEmptyState, ActivityMobileCard, ItemsCell } from "./activity-tab-parts";

const DESKTOP_ROW_HEIGHT = 44;
const RECENT_ACTIVITY_WINDOW_DAYS = 30;

const COLUMNS = [
  { label: "Txn ID", className: "w-[130px]" },
  { label: "Customer", className: "flex-1" },
  { label: "Amount", className: "w-[110px]" },
  { label: "Points", className: "w-[90px]" },
  { label: "Date", className: "w-[150px]" },
  { label: "Items", className: "w-[220px]" },
];

interface ActivityTabProps {
  currencyCode?: string;
  filterCustomerId?: string;
  filterCustomerName?: string;
  onClearFilter?: () => void;
}

export function ActivityTab({
  currencyCode = "NGN",
  filterCustomerId,
  filterCustomerName,
  onClearFilter,
}: ActivityTabProps) {
  const isDesktop = useMediaQuery("(min-width: 1024px)");
  const {
    transactions,
    loading,
    hasFullHistory,
    loadFullHistory,
    dateRange,
    setDateRange,
    refetch,
  } = useCustomerTransactions();
  const [searchTerm, setSearchTerm] = useState("");
  const { user } = useAuth();
  const isAuditor = user?.role === "auditor";

  usePullToRefreshHandler(refetch);

  // Filtering to one customer or searching must match their entire history, not just the recent-activity window loaded by de…
  // Rationale: docs/CLIENT_COMMENTS.md#line-components-customers-activity-tab-tsx-L109
  useEffect(() => {
    if (dateRange.from) return;
    if (filterCustomerId || searchTerm) loadFullHistory();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filterCustomerId, searchTerm, dateRange.from]);

  const scopedTransactions = useMemo(() => {
    if (!filterCustomerId) return transactions;
    return transactions.filter((t) => t.customerId === filterCustomerId);
  }, [transactions, filterCustomerId]);

  const { results: filtered } = useMemo(
    () =>
      genericFuzzySearch(searchTerm, scopedTransactions, [
        "customerName",
        "transactionNumber",
      ]),
    [searchTerm, scopedTransactions],
  );

  const desktopScrollRef = useRef<HTMLDivElement>(null);
  const rowVirtualizer = useVirtualizer({
    count: filtered.length,
    getScrollElement: () => desktopScrollRef.current,
    estimateSize: () => DESKTOP_ROW_HEIGHT,
    overscan: 8,
  });

  const SearchInput = (
    <div className="flex flex-col sm:flex-row gap-2">
      <div className="relative flex-1">
        <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
        <input
          type="text"
          placeholder="Search by customer or transaction ID"
          aria-label="Search customer activity"
          value={searchTerm}
          onChange={(e) => setSearchTerm(e.target.value)}
          className="w-full bg-card border border-border md:bg-muted md:border-none rounded-[10px] pl-9 pr-4 py-2 text-[13px] focus:ring-1 focus:ring-primary outline-none"
        />
      </div>
      <DateRangePicker
        value={dateRange}
        onChange={setDateRange}
        className="md:bg-muted md:border-none"
      />
    </div>
  );

  const FilterChip = (filterCustomerId || dateRange.from) && (
    <div className="flex items-center gap-2">
      {filterCustomerId && (
        <div className="inline-flex items-center gap-1.5 bg-primary/10 text-primary px-3 py-1 rounded-full text-[12px] font-medium">
          Showing history for {filterCustomerName || "customer"}
          <button
            onClick={onClearFilter}
            className="hover:bg-primary/20 rounded-full p-0.5 transition-colors"
          >
            <X className="w-3 h-3" />
          </button>
        </div>
      )}
      {dateRange.from && (
        <button
          onClick={() => setDateRange({})}
          className="text-[11.5px] text-muted-foreground hover:text-foreground underline"
        >
          Clear date range
        </button>
      )}
    </div>
  );

  const RecentWindowNote = !hasFullHistory && !dateRange.from && (
    <p className="text-[11.5px] text-muted-foreground/70">
      Showing last {RECENT_ACTIVITY_WINDOW_DAYS} days. Search, select a date
      range, or select a customer to look further back.
    </p>
  );

  const EmptyState = (
    <ActivityEmptyState loading={loading} isAuditor={isAuditor} />
  );

  return (
    <div className="flex flex-col md:flex-1 md:min-h-0 gap-4">
      {/* Mobile: flat, no wrapping card. Conditionally rendered, not
          CSS-hidden: the desktop branch is virtualized and this one isn't. */}
      {!isDesktop && (
      <div className="flex flex-col gap-3">
        {SearchInput}
        {FilterChip}
        {RecentWindowNote}

        {loading || filtered.length === 0 ? (
          EmptyState
        ) : (
          <div className="flex flex-col gap-2">
            {filtered.map((txn) => (
              <ActivityMobileCard
                key={txn.id}
                txn={txn}
                currencyCode={currencyCode}
              />
            ))}
          </div>
        )}
      </div>
      )}

      {/* Desktop: div-based table (ARIA roles stand in for real <table> semantics, div-based so it can be virtualized) */}
      {isDesktop && (
      <Card className="flex flex-col gap-0 py-0 border rounded-[14px] shadow-sm flex-1 min-h-0 overflow-hidden">
        <div className="p-4 border-b space-y-3">
          {SearchInput}
          {FilterChip}
          {RecentWindowNote}
        </div>

        {loading || filtered.length === 0 ? (
          EmptyState
        ) : (
          <>
          <div
            ref={desktopScrollRef}
            role="table"
            aria-label="Customer transaction activity"
            className="flex-1 overflow-y-auto"
          >
            <div role="rowgroup" className="sticky top-0 bg-background z-10">
              <div role="row" className="flex gap-2 px-4 border-b">
                {COLUMNS.map((col) => (
                  <div
                    key={col.label}
                    role="columnheader"
                    className={`h-10 flex items-center text-[11px] font-bold text-muted-foreground uppercase tracking-wide ${col.className}`}
                  >
                    {col.label}
                  </div>
                ))}
              </div>
            </div>

            <div
              role="rowgroup"
              className="relative w-full"
              style={{ height: rowVirtualizer.getTotalSize() }}
            >
              {rowVirtualizer.getVirtualItems().map((virtualRow) => {
                const txn = filtered[virtualRow.index];
                return (
                  <div
                    key={txn.id}
                    role="row"
                    tabIndex={0}
                    className="absolute top-0 left-0 w-full flex items-center gap-2 px-4 border-b border-border/50"
                    style={{
                      height: virtualRow.size,
                      transform: `translateY(${virtualRow.start}px)`,
                    }}
                  >
                    <div
                      role="cell"
                      className="w-[130px] font-medium text-[12px] truncate"
                    >
                      {txn.transactionNumber}
                    </div>
                    <div role="cell" className="flex-1 text-[13px] truncate">
                      {txn.customerName}
                    </div>
                    <div
                      role="cell"
                      className="w-[110px] text-[13px] font-medium"
                    >
                      {formatCurrency(txn.amount, currencyCode)}
                    </div>
                    <div
                      role="cell"
                      className="w-[90px] text-[13px] text-amber-600"
                    >
                      {txn.pointsEarned > 0 ? (
                        <span className="inline-flex items-center gap-1">
                          <Star className="w-3.5 h-3.5 fill-amber-600" />
                          {txn.pointsEarned}
                        </span>
                      ) : (
                        "-"
                      )}
                    </div>
                    <div
                      role="cell"
                      className="w-[150px] text-[12px] text-muted-foreground"
                    >
                      {formatDateTime(txn.date)}
                    </div>
                    <div
                      role="cell"
                      className="w-[220px] text-[12.5px] truncate"
                    >
                      <ItemsCell txn={txn} />
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
          <ScrollToTopButton scrollRef={desktopScrollRef} />
          </>
        )}
      </Card>
      )}
    </div>
  );
}
