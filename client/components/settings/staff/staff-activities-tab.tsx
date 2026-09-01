"use client";

import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { format } from "date-fns";
import { Loader2 } from "lucide-react";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Card } from "@/components/ui/card";
import { SearchInput } from "@/components/ui/search-input";
import { FilterPill } from "@/components/ui/filter-pill";
import { TablePagination } from "@/components/ui/table-pagination";
import {
  getActivityLog,
  getDistinctActivityActions,
  getDistinctActivityUsers,
} from "@/lib/db/queries/activity-log";
import { describeActivity, describeActionVerb } from "@/components/activity-log/describe-activity";
import { genericFuzzySearch } from "@/lib/utils/search";
import { queryKeys } from "@/lib/query-keys";
import type { AuditLogRow } from "@/lib/types/audit-log";

const TABLE_NAME = "users";

// Mirrors ActivityLogPage's approach: when searching, fetch a large
// unpaginated batch (matching the other filters) so fuzzy search has the
// full set to search across rather than just the current page.
const SEARCH_FETCH_CAP = 2000;

export function StaffActivitiesTab() {
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(25);
  const [search, setSearch] = useState("");
  const [actionFilter, setActionFilter] = useState("all");
  const [userFilter, setUserFilter] = useState("all");

  const isSearching = search.trim().length > 0;

  const baseFilters = {
    tableName: TABLE_NAME,
    action: actionFilter === "all" ? undefined : actionFilter,
    userId: userFilter === "all" ? undefined : userFilter,
  };

  const pagedFilters = { ...baseFilters, page, pageSize };
  const { data: pagedData, isLoading: isPagedLoading } = useQuery({
    ...queryKeys.activityLog.list(JSON.stringify(pagedFilters)),
    queryFn: () => getActivityLog(pagedFilters),
    enabled: !isSearching,
  });

  const searchFilters = { ...baseFilters, page: 1, pageSize: SEARCH_FETCH_CAP };
  const { data: searchData, isLoading: isSearchLoading } = useQuery({
    ...queryKeys.activityLog.list(JSON.stringify({ ...baseFilters, forSearch: true })),
    queryFn: () => getActivityLog(searchFilters),
    enabled: isSearching,
  });

  const { results: fuzzyResults } = useMemo(
    () =>
      isSearching && searchData
        ? genericFuzzySearch(search, searchData.rows, ["action", "user_name"])
        : { results: [] as AuditLogRow[], isFuzzyFallback: false },
    [isSearching, searchData, search],
  );

  const { data: actions = [] } = useQuery({
    ...queryKeys.activityLog.actions(TABLE_NAME),
    queryFn: () => getDistinctActivityActions(TABLE_NAME),
  });

  const { data: users = [] } = useQuery({
    ...queryKeys.activityLog.users(TABLE_NAME),
    queryFn: () => getDistinctActivityUsers(TABLE_NAME),
  });

  const isLoading = isSearching ? isSearchLoading : isPagedLoading;
  const rows = isSearching
    ? fuzzyResults.slice((page - 1) * pageSize, page * pageSize)
    : pagedData?.rows || [];
  const total = isSearching ? fuzzyResults.length : pagedData?.total || 0;
  const totalPages = Math.max(1, Math.ceil(total / pageSize));

  return (
    <Card className="border rounded-2xl overflow-hidden gap-0 py-0">
      <div className="p-4 border-b border-border space-y-3">
        <SearchInput
          value={search}
          onChange={(v) => {
            setSearch(v);
            setPage(1);
          }}
          placeholder="Search by action or staff member"
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
              ...actions.map((a) => ({ value: a, label: describeActionVerb(a) })),
            ]}
          />

          <FilterPill
            label="Staff"
            value={userFilter}
            onValueChange={(v) => {
              setUserFilter(v);
              setPage(1);
            }}
            options={[
              { value: "all", label: "Everyone" },
              ...users.map((u) => ({ value: u.user_id, label: u.user_name || "Unknown" })),
            ]}
          />
        </div>
      </div>

      <div className="overflow-x-auto">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>When</TableHead>
              <TableHead>Actor</TableHead>
              <TableHead>Action</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {isLoading && (
              <TableRow>
                <TableCell colSpan={3} className="h-24 text-center">
                  <Loader2 className="w-5 h-5 animate-spin mx-auto text-muted-foreground" />
                </TableCell>
              </TableRow>
            )}
            {!isLoading && rows.length === 0 && (
              <TableRow>
                <TableCell colSpan={3} className="h-24 text-center text-muted-foreground">
                  No staff activity found for this filter.
                </TableCell>
              </TableRow>
            )}
            {!isLoading &&
              rows.map((row) => (
                <TableRow key={row.id}>
                  <TableCell className="text-muted-foreground text-sm">
                    {row.created_at ? format(new Date(row.created_at), "MMM d, yyyy h:mm a") : "N/A"}
                  </TableCell>
                  <TableCell>{row.user_name || "System"}</TableCell>
                  <TableCell>{describeActivity(row)}</TableCell>
                </TableRow>
              ))}
          </TableBody>
        </Table>
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
  );
}
