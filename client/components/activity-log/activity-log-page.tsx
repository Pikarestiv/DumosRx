"use client";

import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { History } from "lucide-react";
import { Card } from "@/components/ui/card";
import { type DateRangeValue } from "@/components/ui/date-range-picker";
import { TablePagination } from "@/components/ui/table-pagination";
import { toQueryRange } from "@/lib/utils/date-range";
import {
  getActivityLog,
  getDistinctActivityActions,
  getDistinctActivityUsers,
} from "@/lib/db/queries/activity-log";
import { useAuth, checkCanViewAllActivity } from "@/lib/context/auth-context";
import { queryKeys } from "@/lib/query-keys";
import { genericFuzzySearch } from "@/lib/utils/search";
import { ResponsiveDetailPanel } from "@/components/ui/responsive-detail-panel";
import { ActivityLogDetailPanel } from "./activity-log-detail-panel";
import { ActivityLogFilters } from "./activity-log-filters";
import {
  ActivityLogDesktopTable,
  ActivityLogMobileList,
} from "./activity-log-rows";
import type { AuditLogRow } from "@/lib/types/audit-log";
import type { ActivityLogSortKey } from "@/lib/db/queries/activity-log";

// When searching, fetch a large unpaginated batch matching the other filters
// so fuzzy search has the full set to search across, not just the current
// page. Capped rather than truly unbounded so a very old/busy store can't
// pull its entire history into memory at once.
const SEARCH_FETCH_CAP = 2000;

export function ActivityLogPage() {
  const { user } = useAuth();
  const canViewAll = checkCanViewAllActivity(user?.role);

  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(50);
  const [search, setSearch] = useState("");
  const [actionFilter, setActionFilter] = useState<string>("all");
  const [userFilter, setUserFilter] = useState<string>("all");
  const [roleFilter, setRoleFilter] = useState<string>("all");
  const [dateRange, setDateRange] = useState<DateRangeValue>({});
  const [selectedEntry, setSelectedEntry] = useState<AuditLogRow | null>(null);
  const [sortKey, setSortKey] = useState<ActivityLogSortKey>("created_at");
  const [sortDirection, setSortDirection] = useState<"asc" | "desc">("desc");

  const toggleSort = (key: ActivityLogSortKey) => {
    if (sortKey === key) {
      setSortDirection((d) => (d === "asc" ? "desc" : "asc"));
    } else {
      setSortKey(key);
      setSortDirection("asc");
    }
    setPage(1);
  };

  const isSearching = search.trim().length > 0;

  const baseFilters = {
    action: actionFilter === "all" ? undefined : actionFilter,
    userId: !canViewAll
      ? user?.id
      : userFilter === "all"
        ? undefined
        : userFilter,
    role: canViewAll && roleFilter !== "all" ? roleFilter : undefined,
    ...toQueryRange(dateRange),
    sortKey,
    sortDirection,
  };

  const pagedFilters = { ...baseFilters, page, pageSize };
  const { data: pagedData, isLoading: isPagedLoading } = useQuery({
    ...queryKeys.activityLog.list(JSON.stringify(pagedFilters)),
    queryFn: () => getActivityLog(pagedFilters),
    enabled: !isSearching,
  });

  const searchFilters = { ...baseFilters, page: 1, pageSize: SEARCH_FETCH_CAP };
  const { data: searchData, isLoading: isSearchLoading } = useQuery({
    ...queryKeys.activityLog.list(
      JSON.stringify({ ...baseFilters, forSearch: true }),
    ),
    queryFn: () => getActivityLog(searchFilters),
    enabled: isSearching,
  });

  const { results: fuzzyResults } = useMemo(
    () =>
      isSearching && searchData
        ? genericFuzzySearch(search, searchData.rows, [
            "action",
            "table_name",
            "user_name",
          ])
        : { results: [] as AuditLogRow[], isFuzzyFallback: false },
    [isSearching, searchData, search],
  );

  const { data: actions = [] } = useQuery({
    ...queryKeys.activityLog.actions(),
    queryFn: () => getDistinctActivityActions(),
  });

  const { data: users = [] } = useQuery({
    ...queryKeys.activityLog.users(),
    queryFn: () => getDistinctActivityUsers(),
    enabled: canViewAll,
  });

  const isLoading = isSearching ? isSearchLoading : isPagedLoading;
  const rows = isSearching
    ? fuzzyResults.slice((page - 1) * pageSize, page * pageSize)
    : pagedData?.rows || [];
  const total = isSearching ? fuzzyResults.length : pagedData?.total || 0;
  const totalPages = Math.max(1, Math.ceil(total / pageSize));

  return (
    <div className="flex flex-col gap-4 h-full">
      <div className="flex items-center gap-3">
        <div className="h-10 w-10 rounded-xl bg-primary/10 text-primary flex items-center justify-center shrink-0">
          <History className="h-5 w-5" />
        </div>

        <div>
          <div className="text-[17px] font-serif font-bold">Activity Log</div>
          <div className="text-[12.5px] text-muted-foreground">
            Every recorded action across the store, {total} total
          </div>
        </div>
      </div>

      <Card className="no-hover-scale border rounded-2xl overflow-hidden flex-1 min-h-0 flex flex-col gap-0 py-0">
        <ActivityLogFilters
          search={search}
          onSearchChange={(v) => {
            setSearch(v);
            setPage(1);
          }}
          dateRange={dateRange}
          onDateRangeChange={(v) => {
            setDateRange(v);
            setPage(1);
          }}
          actionFilter={actionFilter}
          onActionFilterChange={(v) => {
            setActionFilter(v);
            setPage(1);
          }}
          actions={actions}
          canViewAll={canViewAll}
          roleFilter={roleFilter}
          onRoleFilterChange={(v) => {
            setRoleFilter(v);
            setPage(1);
          }}
          userFilter={userFilter}
          onUserFilterChange={(v) => {
            setUserFilter(v);
            setPage(1);
          }}
          users={users}
        />

        {/* Desktop: div-based table (ARIA roles stand in for real <table>
            semantics), horizontally scrollable if content ever demands more
            than the column widths naturally settle at. */}
        <ActivityLogDesktopTable
          rows={rows}
          isLoading={isLoading}
          sortKey={sortKey}
          sortDirection={sortDirection}
          onToggleSort={toggleSort}
          onSelect={setSelectedEntry}
        />

        {/* Mobile: rows become stacked, tappable cards instead of a
            cramped table, matching the pattern used by the product
            catalog list. */}
        <ActivityLogMobileList
          rows={rows}
          isLoading={isLoading}
          onSelect={setSelectedEntry}
        />

        <TablePagination
          page={page}
          totalPages={totalPages}
          totalItems={total}
          pageSize={pageSize}
          onPageChange={setPage}
          onPageSizeChange={(size) => {
            setPageSize(size);
            setPage(1);
          }}
        />
      </Card>

      <ResponsiveDetailPanel
        open={!!selectedEntry}
        onOpenChange={(open) => {
          if (!open) setSelectedEntry(null);
        }}
      >
        <ActivityLogDetailPanel
          entry={selectedEntry}
          onClose={() => setSelectedEntry(null)}
        />
      </ResponsiveDetailPanel>
    </div>
  );
}
