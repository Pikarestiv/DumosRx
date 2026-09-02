"use client";

import { format } from "date-fns";
import { SortableHeaderCell } from "@/components/ui/sortable-header-cell";
import { describeActivity } from "./describe-activity";
import type { AuditLogRow } from "@/lib/types/audit-log";
import type { ActivityLogSortKey } from "@/lib/db/queries/activity-log";

const GRID_COLS = "grid-cols-[1fr_180px_190px]";

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

interface ActivityLogRowsProps {
  rows: AuditLogRow[];
  isLoading: boolean;
  sortKey: ActivityLogSortKey;
  sortDirection: "asc" | "desc";
  onToggleSort: (key: ActivityLogSortKey) => void;
  onSelect: (row: AuditLogRow) => void;
}

export function ActivityLogDesktopTable({
  rows,
  isLoading,
  sortKey,
  sortDirection,
  onToggleSort,
  onSelect,
}: ActivityLogRowsProps) {
  return (
    <div
      role="table"
      aria-label="Activity log"
      className="hidden sm:block overflow-x-auto flex-1"
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
              onClick={() => onSelect(row)}
              onKeyDown={(e) => {
                if (e.key === "Enter" || e.key === " ") {
                  e.preventDefault();
                  onSelect(row);
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
  return (
    <div className="sm:hidden flex-1 overflow-y-auto divide-y divide-border">
      {isLoading && (
        <div className="h-24 flex items-center justify-center text-muted-foreground">
          Loading...
        </div>
      )}
      {!isLoading && rows.length === 0 && (
        <div className="h-24 flex items-center justify-center text-muted-foreground text-center px-4">
          No activity found for this filter.
        </div>
      )}
      {!isLoading &&
        rows.map((row) => (
          <div
            key={row.id}
            tabIndex={0}
            onClick={() => onSelect(row)}
            onKeyDown={(e) => {
              if (e.key === "Enter" || e.key === " ") {
                e.preventDefault();
                onSelect(row);
              }
            }}
            className="p-4 space-y-1 active:bg-accent/30 cursor-pointer"
          >
            <div className="font-semibold text-foreground text-[13px]">
              {describeActivity(row)}
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
