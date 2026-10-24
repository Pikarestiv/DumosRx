"use client";

import { useState, useEffect, useMemo, useRef } from "react";
import { useQuery, keepPreviousData } from "@tanstack/react-query";
import { ArrowLeftRight } from "lucide-react";
import { EmptyState } from "@/components/ui/empty-state";
import { format, isToday, isYesterday, differenceInDays } from "date-fns";
import { useVirtualizer } from "@tanstack/react-virtual";
import { genericFuzzySearch } from "@/lib/utils/search";
import { queryKeys } from "@/lib/query-keys";

const DESKTOP_ROW_HEIGHT = 52;
import { StockMovementsSkeleton } from "./stock-movements-skeleton";
import { useRouter, useSearchParams } from "next/navigation";
import { StockMovement } from "./stock-movement-utils";
import { mapMovement } from "./stock-movement-mapping";
import { StockMovementDesktopRow } from "./stock-movement-desktop-row";
import { StockMovementMobileGroup } from "./stock-movement-mobile-group";
import { StockMovementDetailModal } from "./stock-movement-detail-modal";
import { TransferStockDialog } from "./transfer-stock-dialog";
import {
  RECENT_ACTIVITY_WINDOW_DAYS,
  StockMovementsDesktopFilters,
  StockMovementsGridHeader,
  StockMovementsMobileFilters,
  type MovementSortKey,
} from "./stock-movements-filters";
import { usePullToRefreshHandler } from "@/lib/context/pull-to-refresh-context";
import { type DateRangeValue } from "@/components/ui/date-range-picker";
import { useSortableData } from "@/lib/hooks/use-sortable-data";
import { useStore } from "@/lib/context/store-context";
import { useAuth } from "@/lib/context/auth-context";
import { useFeatureGate } from "@/lib/hooks/use-feature-gate";
import { useMediaQuery } from "@/hooks/use-media-query";
import { ScrollToTopButton } from "@/components/ui/scroll-to-top-button";
import { useArrowKeyScroll } from "@/lib/hooks/use-arrow-key-scroll";

function NoMovementsFound() {
  return (
    <EmptyState icon={ArrowLeftRight} title="No movements found" className="py-8" />
  );
}

export function StockMovements() {
  const isDesktop = useMediaQuery("(min-width: 1024px)");
  const [hasFullHistory, setHasFullHistory] = useState(false);
  const [searchTerm, setSearchTerm] = useState("");
  const [typeFilter, setTypeFilter] = useState("all");
  const [dateRange, setDateRange] = useState<DateRangeValue>({});
  const [selectedMovement, setSelectedMovement] =
    useState<StockMovement | null>(null);
  const [showTransferDialog, setShowTransferDialog] = useState(false);
  const router = useRouter();
  const searchParams = useSearchParams();
  const { availableStores } = useStore();
  const { isAdmin } = useAuth();
  const { canManageMultiStore } = useFeatureGate();
  // Mirrors dashboard-header.tsx's hasMultiStoreAccess/actionRequiresIsAdmin gate on the Transfer Stock header action:
  // Rationale: docs/CLIENT_COMMENTS.md#line-components-stock-batch-stock-movements-tsx-L78
  const canTransferStock = isAdmin && canManageMultiStore && availableStores.length > 1;

  // Triggered from the header's "Transfer Stock" button (see dashboard-header.tsx), which — like Add Product's ?action=add —…
  // Rationale: docs/CLIENT_COMMENTS.md#line-components-stock-batch-stock-movements-tsx-L88
  useEffect(() => {
    if (searchParams.get("action") !== "transfer") return;
    if (canTransferStock) setShowTransferDialog(true);
    const newParams = new URLSearchParams(searchParams.toString());
    newParams.delete("action");
    const newUrl =
      window.location.pathname +
      (newParams.toString() ? `?${newParams.toString()}` : "");
    router.replace(newUrl);
  }, [searchParams, router, canTransferStock]);

  // Rationale: docs/CLIENT_COMMENTS.md#block-components-stock-batch-stock-movements-tsx-loading-window
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
    placeholderData: keepPreviousData,
  });
  const movementsData = movementsQuery.data;
  const movements = useMemo(() => movementsData ?? [], [movementsData]);
  const loading = movementsQuery.isFetching;
  const initialLoad = movementsQuery.isLoading;

  usePullToRefreshHandler(async () => {
    await movementsQuery.refetch();
  });

  // Rationale: docs/CLIENT_COMMENTS.md#block-components-stock-batch-stock-movements-tsx-loading-window
  useEffect(() => {
    if (dateRange.from || hasFullHistory || (!searchTerm && typeFilter === "all")) return;
    setHasFullHistory(true);
  }, [searchTerm, typeFilter, hasFullHistory, dateRange.from]);

  const preFilteredMovements = useMemo(
    () =>
      movements.filter((movement) => {
        if (typeFilter === "all") return true;
        if (typeFilter === "transfer")
          return movement.type.startsWith("transfer_");
        return movement.type === typeFilter;
      }),
    [movements, typeFilter],
  );

  const { results: filteredMovements } = useMemo(
    () =>
      genericFuzzySearch(searchTerm, preFilteredMovements, [
        "product",
        "reference",
        "reason",
        "user",
      ]),
    [searchTerm, preFilteredMovements],
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
  useArrowKeyScroll(desktopScrollRef, { enabled: isDesktop });

  const groupedMovements = useMemo(() => {
    const now = new Date();
    return filteredMovements.reduce(
      (acc, movement) => {
        const date = new Date(movement.date);
        let groupLabel = format(date, "MMM d, yyyy").toUpperCase();

        if (isToday(date)) groupLabel = "TODAY";
        else if (isYesterday(date)) groupLabel = "YESTERDAY";
        else {
          const diff = differenceInDays(now, date);
          if (diff > 1 && diff <= 7) groupLabel = `${diff} DAYS AGO`;
        }

        if (!acc[groupLabel]) acc[groupLabel] = [];
        acc[groupLabel].push(movement);
        return acc;
      },
      {} as Record<string, StockMovement[]>,
    );
  }, [filteredMovements]);

  // Rationale: docs/CLIENT_COMMENTS.md#block-components-stock-batch-stock-movements-tsx-loading-window
  if (loading && initialLoad) {
    return <StockMovementsSkeleton />;
  }

  const filterProps = {
    searchTerm,
    setSearchTerm,
    typeFilter,
    setTypeFilter,
    dateRange,
    setDateRange,
    hasFullHistory,
  };

  return (
    <div className="relative flex flex-col flex-1 min-h-0">
      {!isDesktop && <StockMovementsMobileFilters {...filterProps} />}

      {isDesktop && (
      <div className="flex bg-card border border-border rounded-2xl flex-col flex-1 min-h-0">
        <StockMovementsDesktopFilters {...filterProps} />
        <StockMovementsGridHeader
          sortKey={sortKey}
          direction={direction}
          toggleSort={toggleSort}
        />

        <div ref={desktopScrollRef} className="flex-1 overflow-y-auto stable-scrollbar pb-6">
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
        <ScrollToTopButton scrollRef={desktopScrollRef} />
      </div>
      )}

      {/* Mobile: grouped list, each group renders its own card. Conditionally rendered, not `md:hidden`. */}
      {/* Rationale: docs/CLIENT_COMMENTS.md#block-components-stock-batch-stock-movements-tsx-loading-window */}
      {!isDesktop && (
      <div>
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
      )}

      <StockMovementDetailModal
        movement={selectedMovement}
        onClose={() => setSelectedMovement(null)}
        onViewInCatalog={() => {
          setSelectedMovement(null);
          router.push("/inventory/catalog");
        }}
        onReviewed={() => void movementsQuery.refetch()}
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
