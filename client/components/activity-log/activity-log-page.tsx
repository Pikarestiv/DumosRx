"use client";

import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { format } from "date-fns";
import { ChevronLeft, ChevronRight, History } from "lucide-react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { SearchInput } from "@/components/ui/search-input";
import { FilterPill } from "@/components/ui/filter-pill";
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

const PAGE_SIZE = 50;
// When searching, fetch a large unpaginated batch matching the other filters
// so fuzzy search has the full set to search across, not just the current
// page — capped rather than truly unbounded so a very old/busy store can't
// pull its entire history into memory at once.
const SEARCH_FETCH_CAP = 2000;

export function ActivityLogPage() {
  const { user } = useAuth();
  const canViewAll = checkCanViewAllActivity(user?.role);

  const [page, setPage] = useState(1);
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

  const pagedFilters = { ...baseFilters, page, pageSize: PAGE_SIZE };
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
    ? fuzzyResults.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE)
    : pagedData?.rows || [];
  const total = isSearching ? fuzzyResults.length : pagedData?.total || 0;
  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));

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

      <Card className="border rounded-2xl overflow-hidden flex-1 min-h-0 flex flex-col gap-0 pt-0">
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

        <div className="overflow-x-auto flex-1">
          <table className="w-full text-[12.5px] border-collapse">
            <thead className="border-b border-border">
              <tr className=" text-muted-foreground text-[11px] uppercase font-semibold sticky top-0">
                <th className="text-left px-4 py-2.5">Activity</th>
                <th className="text-left px-4 py-2.5">By</th>
                <th className="text-left px-4 py-2.5">When</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {isLoading && (
                <tr>
                  <td
                    colSpan={3}
                    className="px-4 py-8 text-center text-muted-foreground"
                  >
                    Loading...
                  </td>
                </tr>
              )}
              {!isLoading && rows.length === 0 && (
                <tr>
                  <td
                    colSpan={3}
                    className="px-4 py-8 text-center text-muted-foreground"
                  >
                    No activity found for this filter.
                  </td>
                </tr>
              )}
              {rows.map((row) => (
                <tr
                  key={row.id}
                  className="hover:bg-accent/30 cursor-pointer"
                  onClick={() => setSelectedEntry(row)}
                >
                  <td className="px-4 py-2.5">
                    <div className="font-semibold text-foreground">
                      {describeActivity(row)}
                    </div>
                    {row.table_name && (
                      <div className="text-[11px] text-muted-foreground/70">
                        {row.table_name}
                      </div>
                    )}
                  </td>
                  <td className="px-4 py-2.5 text-muted-foreground">
                    {row.user_name?.trim() || "System"}
                  </td>
                  <td className="px-4 py-2.5 text-muted-foreground">
                    {row.created_at
                      ? format(new Date(row.created_at), "d MMM yyyy, h:mm a")
                      : "—"}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <div className="flex items-center justify-between px-4 py-3 border-t border-border shrink-0">
          <span className="text-[12px] text-muted-foreground">
            Page {page} of {totalPages}
          </span>
          <div className="flex gap-2">
            <Button
              variant="outline"
              size="sm"
              disabled={page <= 1}
              onClick={() => setPage((p) => Math.max(1, p - 1))}
            >
              <ChevronLeft className="h-3.5 w-3.5" />
            </Button>
            <Button
              variant="outline"
              size="sm"
              disabled={page >= totalPages}
              onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
            >
              <ChevronRight className="h-3.5 w-3.5" />
            </Button>
          </div>
        </div>
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
