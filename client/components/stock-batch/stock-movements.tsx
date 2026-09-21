"use client";

import { useState, useEffect, useRef } from "react";
import { useQuery, keepPreviousData } from "@tanstack/react-query";
import { Search, Lock, ArrowLeftRight } from "lucide-react";
import { EmptyState } from "@/components/ui/empty-state";
import { Button } from "@/components/ui/button";
import { format, isToday, isYesterday, differenceInDays } from "date-fns";
import { useVirtualizer } from "@tanstack/react-virtual";
import { genericFuzzySearch } from "@/lib/utils/search";
import { queryKeys } from "@/lib/query-keys";

const DESKTOP_ROW_HEIGHT = 52;
import { StockMovementsSkeleton } from "./stock-movements-skeleton";
import { useRouter } from "next/navigation";
import { StockMovement } from "./stock-movement-utils";
import { StockMovementTypeFilter } from "./stock-movement-type-filter";
import { StockMovementDesktopRow } from "./stock-movement-desktop-row";
import { StockMovementMobileGroup } from "./stock-movement-mobile-group";
import { StockMovementDetailModal } from "./stock-movement-detail-modal";
import { TransferStockDialog } from "./transfer-stock-dialog";
import { usePullToRefreshHandler } from "@/lib/context/pull-to-refresh-context";
import { DateRangePicker, type DateRangeValue } from "@/components/ui/date-range-picker";
import type { StockMovementDbRow } from "@/lib/types/stock-movement";
import { SortableHeaderCell } from "@/components/ui/sortable-header-cell";
import { useSortableData } from "@/lib/hooks/use-sortable-data";
import { useStore } from "@/lib/context/store-context";
import { useAuth } from "@/lib/context/auth-context";

type MovementSortKey = "date" | "product" | "type" | "quantity" | "reference" | "user";

const RECENT_ACTIVITY_WINDOW_DAYS = 30;

function mapMovement(m: StockMovementDbRow): StockMovement {
  return {
    id: m.id,
    date: m.created_at || m.movement_date || "",
    product: m.product_name || "Unknown",
    type: m.movement_type || "adjustment",
    quantity: m.quantity || 0,
    reason: m.reason || "",
    reference: m.reference_id || "",
    user: m.performed_by_name?.trim() || "System",
    supplier: m.supplier_name || undefined,
    batchNumber: m.batch_number || undefined,
  };
}

function NoMovementsFound() {
  return (
    <EmptyState icon={ArrowLeftRight} title="No movements found" className="py-8" />
  );
}

export function StockMovements() {
  const [hasFullHistory, setHasFullHistory] = useState(false);
  const [searchTerm, setSearchTerm] = useState("");
  const [typeFilter, setTypeFilter] = useState("all");
  const [dateRange, setDateRange] = useState<DateRangeValue>({});
  const [selectedMovement, setSelectedMovement] =
    useState<StockMovement | null>(null);
  const [showTransferDialog, setShowTransferDialog] = useState(false);
  const router = useRouter();
  const { availableStores } = useStore();
  const { isAdmin } = useAuth();
  // Only meaningful (and only rendered) for a multi-store owner/admin
  // account — a single-store account, or a cashier fixed to one store via
  // user.store_id, has nothing to transfer between. This screen already
  // gates the whole Ledger tab on canManageStockBatch (see
  // useStockBatchManagement), so isAdmin here just narrows further to the
  // roles this direct, unapproved store-to-store move should be limited to.
  const canTransferStock = isAdmin && availableStores.length > 1;

  // Default view is bounded to recent activity since this log grows every sale/receive/adjustment.
  // Respects whatever window is currently active (30-day, custom range, or full history), so a
  // manual/pull refresh doesn't quietly revert someone back out of it. An explicit date range
  // takes precedence over full-history mode: it's a bounded window the user picked on purpose.
  const movementsQuery = useQuery({
    ...queryKeys.stockMovements.list(dateRange, hasFullHistory),
    queryFn: async () => {
      const { getStockMovements } = await import("@/lib/db/local-database");
      const res = dateRange.from
        ? await getStockMovements(dateRange)
        : hasFullHistory
          ? await getStockMovements()
          : await getStockMovements({ sinceDays: RECENT_ACTIVITY_WINDOW_DAYS });
      return (res.data || []).map(mapMovement);
    },
    // Keeps the previously loaded rows on screen while a new date range or
    // history mode is fetched, instead of unmounting into a full skeleton —
    // that would close an in-progress DateRangePicker Popover selection.
    placeholderData: keepPreviousData,
  });
  const movements = movementsQuery.data ?? [];
  const loading = movementsQuery.isFetching;
  const initialLoad = movementsQuery.isLoading;

  usePullToRefreshHandler(async () => {
    await movementsQuery.refetch();
  });

  // Searching or filtering must match the entire log, not just the recent-activity window
  // that's loaded by default, so upgrade to full history the first time either is used.
  // Skipped while a custom date range is active: that's a bounded window the user picked on
  // purpose, so search/filter should stay scoped within it rather than silently discarding it.
  useEffect(() => {
    if (dateRange.from || hasFullHistory || (!searchTerm && typeFilter === "all")) return;
    setHasFullHistory(true);
  }, [searchTerm, typeFilter, hasFullHistory, dateRange.from]);

  const preFilteredMovements = movements.filter((movement) => {
    if (typeFilter === "all") return true;
    // "Transfers" is one filter chip covering both legs (transfer_out on the
    // sending store's ledger, transfer_in on the receiving store's) rather
    // than two separate chips a user would have to know to toggle together.
    if (typeFilter === "transfer") return movement.type.startsWith("transfer_");
    return movement.type === typeFilter;
  });

  const { results: filteredMovements } = genericFuzzySearch(
    searchTerm,
    preFilteredMovements,
    ["product", "reference", "reason", "user"],
  );

  // Sorting only applies to the desktop table view; mobile's date-grouped
  // list below is derived from the unsorted, chronological filteredMovements.
  const { sortKey, direction, toggleSort, sortedData: sortedMovements } =
    useSortableData<StockMovement, MovementSortKey>(filteredMovements, {
      date: (m) => m.date,
      product: (m) => m.product.toLowerCase(),
      type: (m) => m.type,
      quantity: (m) => m.quantity,
      reference: (m) => (m.reference || m.reason || "").toLowerCase(),
      user: (m) => m.user.toLowerCase(),
    });

  const desktopScrollRef = useRef<HTMLDivElement>(null);
  const rowVirtualizer = useVirtualizer({
    count: sortedMovements.length,
    getScrollElement: () => desktopScrollRef.current,
    estimateSize: () => DESKTOP_ROW_HEIGHT,
    overscan: 8,
  });

  const groupedMovements = filteredMovements.reduce(
    (acc, movement) => {
      const date = new Date(movement.date);
      let groupLabel = format(date, "MMM d, yyyy").toUpperCase();

      if (isToday(date)) groupLabel = "TODAY";
      else if (isYesterday(date)) groupLabel = "YESTERDAY";
      else {
        const diff = differenceInDays(new Date(), date);
        if (diff > 1 && diff <= 7) groupLabel = `${diff} DAYS AGO`;
      }

      if (!acc[groupLabel]) acc[groupLabel] = [];
      acc[groupLabel].push(movement);
      return acc;
    },
    {} as Record<string, StockMovement[]>,
  );

  // Only the very first load shows the full-page skeleton. Later refetches
  // (date-range picks, pull-to-refresh, search-driven full-history upgrade)
  // must NOT swap out the whole component tree: that would unmount the
  // DateRangePicker's open Popover mid-selection, closing it before the
  // user can click a second date to complete the range.
  if (loading && initialLoad) {
    return <StockMovementsSkeleton />;
  }

  return (
    <div className="relative flex flex-col flex-1 min-h-0">
      {/* Mobile: search + type/date filters stand alone above the list; no outer card, immutable-log note hidden */}
      <div className="md:hidden space-y-3 mb-4">
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
        {canTransferStock && (
          <Button
            variant="outline"
            size="sm"
            className="w-full gap-1.5 text-[12px]"
            onClick={() => setShowTransferDialog(true)}
          >
            <ArrowLeftRight className="h-3.5 w-3.5" />
            Transfer Stock
          </Button>
        )}
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

      <div className="hidden md:flex bg-card border border-border rounded-2xl flex-col flex-1 min-h-0">
        {/* Header & Filters */}
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
              {canTransferStock && (
                <Button
                  variant="outline"
                  size="sm"
                  className="gap-1.5 text-[12px]"
                  onClick={() => setShowTransferDialog(true)}
                >
                  <ArrowLeftRight className="h-3.5 w-3.5" />
                  Transfer Stock
                </Button>
              )}
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

        {/* Desktop Grid Header */}
        <div className="grid grid-cols-[100px_1fr_130px_100px_1fr_120px] gap-2 px-4 py-2.5 text-[11px] font-bold text-muted-foreground/70 uppercase tracking-wide border-b border-border">
          <SortableHeaderCell
            label="Time"
            active={sortKey === "date"}
            direction={direction}
            onClick={() => toggleSort("date")}
          />
          <SortableHeaderCell
            label="Product"
            active={sortKey === "product"}
            direction={direction}
            onClick={() => toggleSort("product")}
          />
          <SortableHeaderCell
            label="Type"
            active={sortKey === "type"}
            direction={direction}
            onClick={() => toggleSort("type")}
          />
          <SortableHeaderCell
            label="Qty"
            active={sortKey === "quantity"}
            direction={direction}
            onClick={() => toggleSort("quantity")}
          />
          <SortableHeaderCell
            label="Reference / Reason"
            active={sortKey === "reference"}
            direction={direction}
            onClick={() => toggleSort("reference")}
          />
          <SortableHeaderCell
            label="User"
            active={sortKey === "user"}
            direction={direction}
            onClick={() => toggleSort("user")}
          />
        </div>

        {/* List */}
        <div ref={desktopScrollRef} className="flex-1 overflow-y-auto pb-6">
          {sortedMovements.length === 0 && <NoMovementsFound />}
          {sortedMovements.length > 0 && (
            <div
              className="relative w-full"
              style={{ height: rowVirtualizer.getTotalSize() }}
            >
              {rowVirtualizer.getVirtualItems().map((virtualRow) => {
                const movement = sortedMovements[virtualRow.index];
                return (
                  <div
                    key={movement.id}
                    className="absolute top-0 left-0 w-full"
                    style={{
                      height: virtualRow.size,
                      transform: `translateY(${virtualRow.start}px)`,
                    }}
                  >
                    <StockMovementDesktopRow
                      movement={movement}
                      onSelect={() => setSelectedMovement(movement)}
                    />
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>

      {/* Mobile: grouped list, each group already renders its own card */}
      <div className="md:hidden">
        {filteredMovements.length === 0 && <NoMovementsFound />}
        {filteredMovements.length > 0 &&
          Object.entries(groupedMovements).map(([groupLabel, groupItems]) => (
            <StockMovementMobileGroup
              key={groupLabel}
              groupLabel={groupLabel}
              movements={groupItems}
              onSelect={setSelectedMovement}
            />
          ))}
      </div>

      <StockMovementDetailModal
        movement={selectedMovement}
        onClose={() => setSelectedMovement(null)}
        onViewInCatalog={() => {
          setSelectedMovement(null);
          router.push("/inventory/catalog");
        }}
      />

      {canTransferStock && (
        <TransferStockDialog
          open={showTransferDialog}
          onOpenChange={setShowTransferDialog}
          onTransferred={() => void movementsQuery.refetch()}
        />
      )}
    </div>
  );
}
