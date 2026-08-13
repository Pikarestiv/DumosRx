"use client";

import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { format } from "date-fns";
import { History } from "lucide-react";
import { Card } from "@/components/ui/card";
import { SearchInput } from "@/components/ui/search-input";
import { FilterPill } from "@/components/ui/filter-pill";
import { TablePagination } from "@/components/ui/table-pagination";
import {
  getActivityLog,
  getDistinctActivityActions,
  getDistinctActivityUsers,
} from "@/lib/db/queries/activity-log";
import { useAuth, checkCanViewAllActivity } from "@/lib/context/auth-context";
import { queryKeys } from "@/lib/query-keys";
import { STAFF_ROLES } from "@/lib/constants/roles";
import { genericFuzzySearch } from "@/lib/utils/search";
import { ResponsiveDetailPanel } from "@/components/ui/responsive-detail-panel";
import { ActivityLogDetailPanel } from "./activity-log-detail-panel";
import { describeActivity, describeActionVerb } from "./describe-activity";
import type { AuditLogRow } from "@/lib/types/audit-log";

const GRID_COLS = "grid-cols-[1fr_180px_190px]";

// When searching, fetch a large unpaginated batch matching the other filters
// so fuzzy search has the full set to search across, not just the current
// page — capped rather than truly unbounded so a very old/busy store can't
// pull its entire history into memory at once.
const SEARCH_FETCH_CAP = 2000;

function EmptyState({ message }: { message: string }) {
  return (
    <div role="row" className={`grid ${GRID_COLS}`}>
      <div
        role="cell"
        className="col-span-3 px-4 py-8 text-center text-muted-foreground"
      >
        {message}
      </div>
    </div>
  );
}

export function ActivityLogPage() {
  const { user } = useAuth();
  const canViewAll = checkCanViewAllActivity(user?.role);

  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(50);
  const [search, setSearch] = useState("");
  const [actionFilter, setActionFilter] = useState<string>("all");
  const [userFilter, setUserFilter] = useState<string>("all");
  const [roleFilter, setRoleFilter] = useState<string>("all");
  const [selectedEntry, setSelectedEntry] = useState<AuditLogRow | null>(null);

  const isSearching = search.trim().length > 0;

  const baseFilters = {
    action: actionFilter === "all" ? undefined : actionFilter,
    userId: !canViewAll
      ? user?.id
      : userFilter === "all"
        ? undefined
        : userFilter,
    role: canViewAll && roleFilter !== "all" ? roleFilter : undefined,
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
    queryKey: ["activityLogUsers"],
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

      <Card className="border rounded-2xl overflow-hidden flex-1 min-h-0 flex flex-col gap-0 py-0">
        <div className="p-4 border-b border-border space-y-3 shrink-0">
          <SearchInput
            value={search}
            onChange={(v) => {
              setSearch(v);
              setPage(1);
            }}
            placeholder="Search by action, table, or staff member"
            inputClassName="bg-muted border-transparent"
          />

          <div className="flex flex-wrap gap-2">
            <FilterPill
              label="Action"
              value={actionFilter}
              onValueChange={(v) => {
                setActionFilter(v);
                setPage(1);
              }}
              options={[
                { value: "all", label: "All Actions" },
                ...actions.map((a) => ({
                  value: a,
                  label: describeActionVerb(a),
                })),
              ]}
            />

            {canViewAll && (
              <FilterPill
                label="Role"
                value={roleFilter}
                onValueChange={(v) => {
                  setRoleFilter(v);
                  setPage(1);
                }}
                options={[
                  { value: "all", label: "All Roles" },
                  ...STAFF_ROLES.map((r) => ({
                    value: r.value,
                    label: r.label,
                  })),
                ]}
              />
            )}

            {canViewAll && (
              <FilterPill
                label="Staff"
                value={userFilter}
                onValueChange={(v) => {
                  setUserFilter(v);
                  setPage(1);
                }}
                options={[
                  { value: "all", label: "Everyone" },
                  ...users.map((u) => ({
                    value: u.user_id,
                    label: u.user_name || "Unknown",
                  })),
                ]}
              />
            )}
          </div>
        </div>

        {/* Div-based table — ARIA roles stand in for real <table> semantics */}
        <div
          role="table"
          aria-label="Activity log"
          className="overflow-x-auto flex-1"
        >
          <div
            role="rowgroup"
            className="sticky top-0 z-10 bg-muted/40 border-b border-border"
          >
            <div
              role="row"
              className={`grid ${GRID_COLS} text-muted-foreground text-[11px] uppercase font-semibold`}
            >
              <div role="columnheader" className="px-4 py-2.5">
                Activity
              </div>
              <div role="columnheader" className="px-4 py-2.5">
                By
              </div>
              <div role="columnheader" className="px-4 py-2.5">
                When
              </div>
            </div>
          </div>

          <div role="rowgroup" className="divide-y divide-border">
            {isLoading && <EmptyState message="Loading..." />}
            {!isLoading && rows.length === 0 && (
              <EmptyState message="No activity found for this filter." />
            )}
            {!isLoading &&
              rows.map((row) => (
                <div
                  key={row.id}
                  role="row"
                  tabIndex={0}
                  onClick={() => setSelectedEntry(row)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" || e.key === " ") {
                      e.preventDefault();
                      setSelectedEntry(row);
                    }
                  }}
                  className={`grid ${GRID_COLS} items-center hover:bg-accent/30 cursor-pointer text-[12.5px]`}
                >
                  <div role="cell" className="px-4 py-2.5">
                    <div className="font-semibold text-foreground">
                      {describeActivity(row)}
                    </div>
                    {row.table_name && (
                      <div className="text-[11px] text-muted-foreground/70">
                        {row.table_name}
                      </div>
                    )}
                  </div>
                  <div
                    role="cell"
                    className="px-4 py-2.5 text-muted-foreground"
                  >
                    {row.user_name?.trim() || "System"}
                  </div>
                  <div
                    role="cell"
                    className="px-4 py-2.5 text-muted-foreground"
                  >
                    {row.created_at
                      ? format(new Date(row.created_at), "d MMM yyyy, h:mm a")
                      : "—"}
                  </div>
                </div>
              ))}
          </div>
        </div>

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
