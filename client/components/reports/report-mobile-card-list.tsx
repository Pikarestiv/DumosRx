import { ArrowDown, ArrowUp, ArrowUpDown, ChevronRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import type { ReportRow } from "./report-table-view";
import type { SortDirection } from "@/lib/hooks/use-sortable-data";

interface ReportMobileCardListProps {
  rows: ReportRow[];
  columns: string[];
  sortKey: string | null;
  direction: SortDirection;
  onSelectSort: (column: string) => void;
  onToggleDirection: () => void;
  onRowClick?: (row: ReportRow) => void;
}

function cellText(value: unknown): string {
  if (value == null) return "";
  return String(value);
}

export function ReportMobileCardList({
  rows,
  columns,
  sortKey,
  direction,
  onSelectSort,
  onToggleDirection,
  onRowClick,
}: ReportMobileCardListProps) {
  const primaryCol = columns[0];
  const secondaryCols = columns.slice(1);
  const DirectionIcon =
    !sortKey ? ArrowUpDown : direction === "asc" ? ArrowUp : ArrowDown;

  return (
    <div className="space-y-3">
      <div className="flex items-center gap-2">
        <span className="text-[11.5px] font-medium text-muted-foreground shrink-0">
          Sort by
        </span>
        <Select
          value={sortKey ?? "__default__"}
          onValueChange={(value) => {
            if (value !== "__default__") onSelectSort(value);
          }}
        >
          <SelectTrigger
            aria-label="Sort report rows"
            className="h-8 text-[12px] flex-1 bg-card"
          >
            <SelectValue placeholder="Default order" />
          </SelectTrigger>
          <SelectContent>
            {columns.map((column) => (
              <SelectItem key={column} value={column} className="text-[12.5px]">
                {column}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        {sortKey && (
          <Button
            type="button"
            variant="outline"
            size="icon"
            className="h-8 w-8 shrink-0"
            aria-label={`Sort direction: ${direction === "asc" ? "ascending" : "descending"}`}
            onClick={onToggleDirection}
          >
            <DirectionIcon className="h-3.5 w-3.5" />
          </Button>
        )}
      </div>

      <div className="flex flex-col gap-2.5">
        {rows.map((row, idx) => {
          const cardBody = (
            <>
              <div className="flex items-start justify-between gap-2.5">
                <div className="min-w-0 flex-1">
                  <div className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground/80">
                    {primaryCol}
                  </div>
                  <div className="text-[13.5px] font-semibold text-foreground break-words">
                    {cellText(row[primaryCol]) || "—"}
                  </div>
                </div>
                {onRowClick && (
                  <ChevronRight className="w-4 h-4 text-muted-foreground shrink-0 mt-1" />
                )}
              </div>

              {secondaryCols.length > 0 && (
                <div
                  className={`grid ${secondaryCols.length === 1 ? "grid-cols-1" : "grid-cols-2"} gap-x-4 gap-y-2 mt-2.5 pt-2.5 border-t border-border/60`}
                >
                  {secondaryCols.map((col) => (
                    <div key={col} className="min-w-0">
                      <div className="text-[10.5px] font-medium uppercase tracking-wide text-muted-foreground truncate">
                        {col}
                      </div>
                      <div className="text-[12.5px] font-medium text-foreground break-words">
                        {cellText(row[col]) || "—"}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </>
          );

          if (onRowClick) {
            return (
              <button
                key={idx}
                type="button"
                onClick={() => onRowClick(row)}
                className="w-full text-left bg-card border border-border rounded-xl p-3.5 hover:bg-muted/30 active:bg-muted/50 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              >
                {cardBody}
              </button>
            );
          }

          return (
            <div
              key={idx}
              className="bg-card border border-border rounded-xl p-3.5"
            >
              {cardBody}
            </div>
          );
        })}
      </div>
    </div>
  );
}
