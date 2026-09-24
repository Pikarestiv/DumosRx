"use client";

import { useMemo } from "react";
import { format } from "date-fns";
import { History } from "lucide-react";
import { SortableHeaderCell } from "@/components/ui/sortable-header-cell";
import { EmptyState } from "@/components/ui/empty-state";
import { describeActivity } from "./describe-activity";
import type { AuditLogRow } from "@/lib/types/audit-log";
import type { ActivityLogSortKey } from "@/lib/db/queries/activity-log";

const GRID_COLS = "grid-cols-[1fr_180px_190px]";

/** Collapses consecutive rows sharing a correlation_id (e.g. everything one
 * sale writes - sales, sale_items, stock_movements, loyalty_transactions...)
 * into one visual row, so a store owner sees "Sale processed (+12 more)"
 * instead of 13 separate entries. Only ever merges rows already adjacent in
 * the current (already paginated/sorted) list - no query, sort, or
 * pagination change, so a group split across two pages just shows partially
 * on each rather than being force-merged. */
interface GroupedActivityRow {
  primary: AuditLogRow;
  group: AuditLogRow[];
}

function groupByCorrelation(rows: AuditLogRow[]): GroupedActivityRow[] {
  const result: GroupedActivityRow[] = [];
  let i = 0;
  while (i < rows.length) {
    const correlationId = rows[i].correlation_id;
    if (!correlationId) {
      result.push({ primary: rows[i], group: [rows[i]] });
      i++;
      continue;
    }
    let j = i;
    const group: AuditLogRow[] = [];
    while (j < rows.length && rows[j].correlation_id === correlationId) {
      group.push(rows[j]);
      j++;
    }
    const primary = group.find((r) => r.table_name === "sales") || group[0];
    result.push({ primary, group });
    i = j;
  }
  return result;
}

function ActivityLogEmptyRow({ message }: { message: string }) {
  return (
    <div role="row" className={`grid ${GRID_COLS}`}>
      <div role="cell" className="col-span-3">
        <EmptyState icon={History} title={message} className="py-8" />
      </div>
    </div>
  );
}

interface ActivityLogRowsProps {
  rows: AuditLogRow[];
  isLoading: boolean;
  sortKey: ActivityLogSortKey;
  sortDirection: "asc" | "desc";
  onToggleSort: (key: ActivityLogSortKey) => void;
  /** `related` is every row in the same correlation group (including
   * `row` itself) - empty/single-item when the row has no correlation_id. */
  onSelect: (row: AuditLogRow, related: AuditLogRow[]) => void;
}

export function ActivityLogDesktopTable({
  rows,
  isLoading,
  sortKey,
  sortDirection,
  onToggleSort,
  onSelect,
}: ActivityLogRowsProps) {
  const groupedRows = useMemo(() => groupByCorrelation(rows), [rows]);
  return (
    <div
      role="table"
      aria-label="Activity log"
      className="hidden sm:block overflow-x-auto flex-1"
    >
      <div
        role="rowgroup"
        className="sticky top-0 z-10 bg-muted border-b border-border"
      >
        <div
          role="row"
          className={`grid ${GRID_COLS} text-muted-foreground text-[11px] uppercase font-semibold`}
        >
          <div role="columnheader" className="px-4 py-2.5">
            <SortableHeaderCell
              label="Activity"
              active={sortKey === "action"}
              direction={sortDirection}
              onClick={() => onToggleSort("action")}
            />
          </div>
          <div role="columnheader" className="px-4 py-2.5">
            <SortableHeaderCell
              label="By"
              active={sortKey === "user_name"}
              direction={sortDirection}
              onClick={() => onToggleSort("user_name")}
            />
          </div>
          <div role="columnheader" className="px-4 py-2.5">
            <SortableHeaderCell
              label="When"
              active={sortKey === "created_at"}
              direction={sortDirection}
              onClick={() => onToggleSort("created_at")}
            />
          </div>
        </div>
      </div>

      <div role="rowgroup" className="divide-y divide-border">
        {isLoading && <ActivityLogEmptyRow message="Loading..." />}
        {!isLoading && rows.length === 0 && (
          <ActivityLogEmptyRow message="No activity found for this filter." />
        )}
        {!isLoading &&
          groupedRows.map(({ primary: row, group }) => (
            <div
              key={row.id}
              role="row"
              tabIndex={0}
              onClick={() => onSelect(row, group)}
              onKeyDown={(e) => {
                if (e.key === "Enter" || e.key === " ") {
                  e.preventDefault();
                  onSelect(row, group);
                }
              }}
              className={`grid ${GRID_COLS} items-center hover:bg-accent/30 cursor-pointer text-[12.5px] outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-inset`}
            >
              <div role="cell" className="px-4 py-2.5">
                <div className="font-semibold text-foreground flex items-center gap-1.5">
                  {describeActivity(row)}
                  {group.length > 1 && (
                    <span className="text-[10px] font-semibold text-muted-foreground bg-muted rounded-full px-1.5 py-0.5">
                      +{group.length - 1} more
                    </span>
                  )}
                </div>
                {row.table_name && (
                  <div className="text-[11px] text-muted-foreground/70">
                    {row.table_name}
                  </div>
                )}
              </div>
              <div role="cell" className="px-4 py-2.5 text-muted-foreground">
                {row.user_name?.trim() || "System"}
              </div>
              <div role="cell" className="px-4 py-2.5 text-muted-foreground">
                {row.created_at
                  ? format(new Date(row.created_at), "d MMM yyyy, h:mm a")
                  : "N/A"}
              </div>
            </div>
          ))}
      </div>
    </div>
  );
}

export function ActivityLogMobileList({
  rows,
  isLoading,
  onSelect,
}: Pick<ActivityLogRowsProps, "rows" | "isLoading" | "onSelect">) {
  const groupedRows = useMemo(() => groupByCorrelation(rows), [rows]);
  return (
    <div className="sm:hidden flex-1 overflow-y-auto divide-y divide-border">
      {isLoading && (
        <div className="h-24 flex items-center justify-center text-muted-foreground">
          Loading...
        </div>
      )}
      {!isLoading && rows.length === 0 && (
        <EmptyState icon={History} title="No activity found for this filter" className="py-8" />
      )}
      {!isLoading &&
        groupedRows.map(({ primary: row, group }) => (
          <div
            key={row.id}
            role="button"
            tabIndex={0}
            onClick={() => onSelect(row, group)}
            onKeyDown={(e) => {
              if (e.key === "Enter" || e.key === " ") {
                e.preventDefault();
                onSelect(row, group);
              }
            }}
            className="p-4 space-y-1 active:bg-accent/30 cursor-pointer outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-inset"
          >
            <div className="font-semibold text-foreground text-[13px] flex items-center gap-1.5">
              {describeActivity(row)}
              {group.length > 1 && (
                <span className="text-[10px] font-semibold text-muted-foreground bg-muted rounded-full px-1.5 py-0.5">
                  +{group.length - 1} more
                </span>
              )}
            </div>
            {row.table_name && (
              <div className="text-[11px] text-muted-foreground/70">
                {row.table_name}
              </div>
            )}
            <div className="flex items-center justify-between text-[12.5px] text-muted-foreground">
              <span>{row.user_name?.trim() || "System"}</span>
              <span>
                {row.created_at
                  ? format(new Date(row.created_at), "d MMM yyyy, h:mm a")
                  : "N/A"}
              </span>
            </div>
          </div>
        ))}
    </div>
  );
}
