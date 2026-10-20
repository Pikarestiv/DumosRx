"use client";

import { useMemo } from "react";
import { FileText } from "lucide-react";

import { EmptyState } from "@/components/ui/empty-state";
import { SortableHeaderCell } from "@/components/ui/sortable-header-cell";
import { useSortableData } from "@/lib/hooks/use-sortable-data";
import { cn } from "@/lib/utils";

export type ReportRow = Record<string, unknown>;

interface ReportTableViewProps {
  rows: ReportRow[];
  /** Column order, from the report's own config, so the view matches the
   * CSV/PDF. Falls back to the first row's key order. */
  headers?: string[];
  /** Given only for a report whose rows open a record of their own; without
   * it rows stay plain text and are neither focusable nor hoverable. */
  onRowClick?: (row: ReportRow) => void;
}

function cellText(value: unknown): string {
  if (value == null) return "";
  return String(value);
}

/** Numbers must sort numerically even though every report row is typed as
 * `unknown`: "1,000" ordering before "9" is the classic string-sort bug. */
function comparableValue(value: unknown): string | number {
  if (typeof value === "number") return value;
  const text = cellText(value).trim();
  if (text === "") return "";
  const numeric = Number(text.replace(/[^0-9.-]/g, ""));
  return text !== "" && Number.isFinite(numeric) && /\d/.test(text) && !/[a-zA-Z]/.test(text)
    ? numeric
    : text.toLowerCase();
}

// One generic on-screen renderer for every Report Center report:
// Rationale: docs/CLIENT_COMMENTS.md#block-components-reports-report-table-view-tsx-L40
export function ReportTableView({ rows, headers, onRowClick }: ReportTableViewProps) {
  const columns = useMemo(
    () => headers ?? (rows.length > 0 ? Object.keys(rows[0]) : []),
    [headers, rows],
  );

  const accessors = useMemo(() => {
    const map: Record<string, (row: ReportRow) => string | number> = {};
    for (const column of columns) {
      map[column] = (row) => comparableValue(row[column]);
    }
    return map;
  }, [columns]);

  const { sortKey, direction, toggleSort, sortedData } = useSortableData(
    rows,
    accessors,
  );

  if (rows.length === 0 || columns.length === 0) {
    return (
      <EmptyState
        icon={FileText}
        title="Nothing to show"
        description="No rows matched the selected date range and filters."
      />
    );
  }

  const gridTemplate = `repeat(${columns.length}, minmax(120px, 1fr))`;

  return (
    <div className="border border-border rounded-xl overflow-x-auto">
      <div role="table" aria-label="Report rows" className="w-full text-[12.5px]">
        <div role="rowgroup">
          <div
            role="row"
            className="grid bg-muted/40 text-muted-foreground text-[11px] uppercase font-semibold"
            style={{ gridTemplateColumns: gridTemplate }}
          >
            {columns.map((column) => (
              <div key={column} role="columnheader" className="px-3 py-2">
                <SortableHeaderCell
                  label={column}
                  active={sortKey === column}
                  direction={direction}
                  onClick={() => toggleSort(column)}
                />
              </div>
            ))}
          </div>
        </div>
        <div role="rowgroup" className="divide-y divide-border">
          {sortedData.map((row, index) => (
            <div
              key={index}
              role="row"
              tabIndex={onRowClick ? 0 : undefined}
              onClick={onRowClick ? () => onRowClick(row) : undefined}
              onKeyDown={
                onRowClick
                  ? (event) => {
                      if (event.key === "Enter" || event.key === " ") {
                        event.preventDefault();
                        onRowClick(row);
                      }
                    }
                  : undefined
              }
              className={cn(
                "grid transition-colors",
                onRowClick
                  ? "cursor-pointer hover:bg-muted/40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-inset"
                  : "hover:bg-muted/30",
              )}
              style={{ gridTemplateColumns: gridTemplate }}
            >
              {columns.map((column) => (
                <div
                  key={column}
                  role="cell"
                  className="px-3 py-2 truncate"
                  title={cellText(row[column])}
                >
                  {cellText(row[column])}
                </div>
              ))}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
