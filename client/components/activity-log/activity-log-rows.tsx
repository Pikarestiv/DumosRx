"use client";

import { useMemo } from "react";
import { format } from "date-fns";
import { History } from "lucide-react";
import { SortableHeaderCell } from "@/components/ui/sortable-header-cell";
import { EmptyState } from "@/components/ui/empty-state";
import { describeActivity } from "./describe-activity";
import type { AuditLogRow } from "@/lib/types/audit-log";
import type { ActivityLogSortKey } from "@/lib/db/queries/activity-log";
import { groupByCorrelation } from "./activity-log-grouping";

export { ActivityLogMobileList, ActivityLogMobileCard } from "./activity-log-mobile-list";

const GRID_COLS = "grid-cols-[minmax(240px,1fr)_180px_190px]";

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
      className="block overflow-x-auto flex-1"
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
                  {!!row.occurrence_count && row.occurrence_count > 1 && (
                    <span
                      className="text-[10px] font-semibold text-muted-foreground bg-muted rounded-full px-1.5 py-0.5"
                      title={`Repeated ${row.occurrence_count} times`}
                    >
                      ×{row.occurrence_count}
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
