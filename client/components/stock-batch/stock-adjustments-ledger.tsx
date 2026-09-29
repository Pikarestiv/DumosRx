"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useQuery, keepPreviousData } from "@tanstack/react-query";
import { useRouter, useSearchParams } from "next/navigation";
import { useVirtualizer } from "@tanstack/react-virtual";
import { format, isToday, isYesterday, differenceInDays } from "date-fns";
import { ClipboardList, Search } from "lucide-react";
import { useMediaQuery } from "@/hooks/use-media-query";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { DateRangePicker, type DateRangeValue } from "@/components/ui/date-range-picker";
import { useHasPermission } from "@/lib/hooks/use-permissions";
import { useArrowKeyScroll } from "@/lib/hooks/use-arrow-key-scroll";
import { usePullToRefreshHandler } from "@/lib/context/pull-to-refresh-context";
import { queryKeys } from "@/lib/query-keys";
import type { StockMovementDbRow } from "@/lib/types/stock-movement";
import {
  ADJUSTMENT_REASONS,
  ALL_ADJUSTMENT_REASONS,
  AUDIT_REFERENCE_TYPE,
  filterAdjustmentGroups,
  groupAdjustmentMovements,
  type AdjustmentGroup,
} from "./adjustment-derivations";
import { AdjustStockFlow } from "./adjust-stock-flow";
import { AdjustmentMobileGroup } from "./adjustment-mobile-group";

const RECENT_ACTIVITY_WINDOW_DAYS = 30;
const ROW_HEIGHT = 64;

function AdjustmentRow({ group }: { group: AdjustmentGroup }) {
  const isAudit = group.source === AUDIT_REFERENCE_TYPE;
  return (
    <div
      data-testid={`adjustment-row-${group.referenceId}`}
      className="grid grid-cols-[1.4fr_1fr_1fr_0.8fr_0.8fr] gap-2 items-center px-4 py-3 border-b border-border text-[13px] hover:bg-accent/30 transition-colors"
    >
      <div className="min-w-0">
        <div className="font-semibold truncate">{group.referenceId}</div>
        <div className="text-[11.5px] text-muted-foreground/70">
          {isAudit ? "Cycle count" : "Quick adjustment"}
        </div>
      </div>
      <div className="text-muted-foreground">
        {group.date ? format(new Date(group.date), "d MMM yyyy, HH:mm") : "—"}
      </div>
      <div className="min-w-0">
        <div className="truncate">{group.reason || "—"}</div>
        {group.note && (
          <div className="text-[11.5px] text-muted-foreground/70 truncate">{group.note}</div>
        )}
      </div>
      <div className="text-muted-foreground">
        {group.itemCount} {group.itemCount === 1 ? "item" : "items"}
      </div>
      <div
        className={`font-bold ${group.netQuantity < 0 ? "text-destructive" : "text-emerald-600"}`}
      >
        {group.netQuantity > 0 ? `+${group.netQuantity}` : group.netQuantity}
      </div>
    </div>
  );
}

export function StockAdjustmentsLedger() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const canAdjustStock = useHasPermission("adjust_stock_counts");
  const isDesktop = useMediaQuery("(min-width: 768px)");

  const [searchTerm, setSearchTerm] = useState("");
  const [reasonFilter, setReasonFilter] = useState<string>(ALL_ADJUSTMENT_REASONS);
  const [dateRange, setDateRange] = useState<DateRangeValue>({});
  const [hasFullHistory, setHasFullHistory] = useState(false);
  const [showAdjustFlow, setShowAdjustFlow] = useState(false);

  // Same query-param handoff the header's Transfer Stock action uses (see
  // stock-movements.tsx): the header only navigates, this page owns the
  // flow state. Re-checks the permission rather than trusting the URL.
  useEffect(() => {
    if (searchParams.get("action") !== "create") return;
    if (canAdjustStock) setShowAdjustFlow(true);
    const newParams = new URLSearchParams(searchParams.toString());
    newParams.delete("action");
    router.replace(
      window.location.pathname + (newParams.toString() ? `?${newParams.toString()}` : ""),
    );
  }, [searchParams, router, canAdjustStock]);

  const adjustmentsQuery = useQuery({
    ...queryKeys.stockAdjustments.list(dateRange, hasFullHistory),
    queryFn: async () => {
      const { getStockMovements } = await import("@/lib/db/local-database");
      const res = dateRange.from
        ? await getStockMovements(dateRange)
        : hasFullHistory
          ? await getStockMovements()
          : await getStockMovements({ sinceDays: RECENT_ACTIVITY_WINDOW_DAYS });
      return res.data || [];
    },
    placeholderData: keepPreviousData,
  });

  usePullToRefreshHandler(async () => {
    await adjustmentsQuery.refetch();
  });

  // Searching or filtering must reach past the default recent-activity
  // window, unless the user picked a bounded date range on purpose.
  useEffect(() => {
    if (dateRange.from || hasFullHistory) return;
    if (!searchTerm && reasonFilter === ALL_ADJUSTMENT_REASONS) return;
    setHasFullHistory(true);
  }, [searchTerm, reasonFilter, hasFullHistory, dateRange.from]);

  const groups = useMemo(
    () => groupAdjustmentMovements((adjustmentsQuery.data ?? []) as StockMovementDbRow[]),
    [adjustmentsQuery.data],
  );

  const visibleGroups = useMemo(
    () => filterAdjustmentGroups(groups, { search: searchTerm, reason: reasonFilter }),
    [groups, searchTerm, reasonFilter],
  );

  const scrollRef = useRef<HTMLDivElement>(null);
  const rowVirtualizer = useVirtualizer({
    count: visibleGroups.length,
    getScrollElement: () => scrollRef.current,
    estimateSize: () => ROW_HEIGHT,
    overscan: 8,
  });
  useArrowKeyScroll(scrollRef, { enabled: isDesktop });

  // Same date bucketing stock-movements.tsx uses for its own mobile cards:
  // the desktop grid's Date column is what a phone loses first, so it is
  // promoted to a heading over the cards that fall under it.
  const groupedByDate = useMemo(() => {
    const now = new Date();
    return visibleGroups.reduce(
      (acc, group) => {
        const date = new Date(group.date);
        let groupLabel = group.date ? format(date, "MMM d, yyyy").toUpperCase() : "UNDATED";

        if (group.date) {
          if (isToday(date)) groupLabel = "TODAY";
          else if (isYesterday(date)) groupLabel = "YESTERDAY";
          else {
            const diff = differenceInDays(now, date);
            if (diff > 1 && diff <= 7) groupLabel = `${diff} DAYS AGO`;
          }
        }

        if (!acc[groupLabel]) acc[groupLabel] = [];
        acc[groupLabel].push(group);
        return acc;
      },
      {} as Record<string, AdjustmentGroup[]>,
    );
  }, [visibleGroups]);

  // The creation flow takes over the whole tab rather than overlaying it, the
  // same way the cycle count owns /inventory/audits. Every hook above still
  // runs, so the ledger's query stays warm for the return trip.
  if (showAdjustFlow && canAdjustStock) {
    return (
      <AdjustStockFlow
        onClose={() => setShowAdjustFlow(false)}
        onSubmitted={() => void adjustmentsQuery.refetch()}
      />
    );
  }

  return (
    <div className="flex flex-col flex-1 min-h-0 bg-card border border-border rounded-2xl">
      <div className="p-4 pb-3 border-b border-border space-y-3">
        <div className="flex items-center gap-2 bg-muted/30 border border-border rounded-[10px] px-3.5 py-2.5">
          <Search className="w-4 h-4 text-muted-foreground/70 shrink-0" />
          <input
            type="text"
            placeholder="Search by adjustment ID or product"
            className="border-0 outline-none text-[13px] w-full bg-transparent"
            value={searchTerm}
            onChange={(event) => setSearchTerm(event.target.value)}
          />
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Select value={reasonFilter} onValueChange={setReasonFilter}>
            <SelectTrigger
              aria-label="Filter by reason"
              className="w-[170px] h-9 text-[13px] bg-muted/30 border-border"
            >
              <SelectValue placeholder="All reasons" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value={ALL_ADJUSTMENT_REASONS}>All reasons</SelectItem>
              {ADJUSTMENT_REASONS.map((reason) => (
                <SelectItem key={reason.value} value={reason.value}>
                  {reason.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <DateRangePicker
            value={dateRange}
            onChange={setDateRange}
            className="bg-muted/30 border-border"
          />
          {canAdjustStock && (
            <Button className="sm:hidden ml-auto" onClick={() => setShowAdjustFlow(true)}>
              Adjust Stock
            </Button>
          )}
        </div>
        {!hasFullHistory && !dateRange.from && (
          <p className="text-[11.5px] text-muted-foreground/70">
            Showing the last {RECENT_ACTIVITY_WINDOW_DAYS} days. Search or select a date range
            to look further back.
          </p>
        )}
      </div>

      {isDesktop && (
        <>
          <div className="grid grid-cols-[1.4fr_1fr_1fr_0.8fr_0.8fr] gap-2 px-4 py-2.5 text-[11px] font-bold text-muted-foreground/70 uppercase tracking-wide border-b border-border">
            <div>Adjustment ID</div>
            <div>Date</div>
            <div>Reason</div>
            <div>Items</div>
            <div>Net qty</div>
          </div>

          <div ref={scrollRef} className="flex-1 overflow-y-auto stable-scrollbar pb-6">
            {visibleGroups.length === 0 && (
              <EmptyState icon={ClipboardList} title="No adjustments found" className="py-8" />
            )}
            {visibleGroups.length > 0 && (
              <div className="relative w-full" style={{ height: rowVirtualizer.getTotalSize() }}>
                {rowVirtualizer.getVirtualItems().map((virtualRow) => {
                  const group = visibleGroups[virtualRow.index];
                  return (
                    <div
                      key={group.referenceId}
                      className="absolute top-0 left-0 w-full"
                      style={{
                        height: virtualRow.size,
                        transform: `translateY(${virtualRow.start}px)`,
                      }}
                    >
                      <AdjustmentRow group={group} />
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </>
      )}

      {/* Mobile: grouped list, each group already renders its own card.
          Conditionally rendered, not `md:hidden`: the desktop branch is
          virtualized and this one isn't, so CSS-hiding meant desktop paid
          for a full unvirtualized render of the whole ledger and then threw
          it away. */}
      {!isDesktop && (
        <div className="flex-1 overflow-y-auto stable-scrollbar p-4 pt-3">
          {visibleGroups.length === 0 && (
            <EmptyState icon={ClipboardList} title="No adjustments found" className="py-8" />
          )}
          {visibleGroups.length > 0 &&
            Object.entries(groupedByDate).map(([groupLabel, groupItems]) => (
              <AdjustmentMobileGroup
                key={groupLabel}
                groupLabel={groupLabel}
                adjustments={groupItems}
              />
            ))}
        </div>
      )}
    </div>
  );
}
