import { useVirtualizer } from "@tanstack/react-virtual";
import { ArrowDown, ArrowUp, ArrowUpDown, SearchX } from "lucide-react";
import { EmptyState } from "@/components/ui/empty-state";
import { SortableHeaderCell } from "@/components/ui/sortable-header-cell";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import type { AuditItem } from "./stock-audits";
import type { AuditCountStatus, AuditSortKey } from "./audit-derivations";
import { diffClassName, formatDiffCurrency, getAuditLedgerGridCols } from "./audit-ledger-format";
import { AuditLedgerRowCells } from "./audit-ledger-row-cells";
import { AuditLedgerTotalsRow } from "./audit-ledger-totals-row";
import type { SortDirection } from "@/lib/hooks/use-sortable-data";

interface AuditMobileSortBarProps {
  columns: { label: string; key: AuditSortKey }[];
  sortKey: AuditSortKey | null;
  direction: SortDirection;
  onToggleSort: (key: AuditSortKey) => void;
}

export function AuditMobileSortBar({
  columns,
  sortKey,
  direction,
  onToggleSort,
}: AuditMobileSortBarProps) {
  const DirectionIcon =
    !sortKey ? ArrowUpDown : direction === "asc" ? ArrowUp : ArrowDown;

  return (
    <div className="flex items-center gap-2 mb-3">
      <span className="text-[11.5px] font-medium text-muted-foreground shrink-0">
        Sort by
      </span>
      <Select
        value={sortKey ?? "__default__"}
        onValueChange={(value) => {
          if (value !== "__default__") onToggleSort(value as AuditSortKey);
        }}
      >
        <SelectTrigger
          aria-label="Sort audit items"
          className="h-8 text-[12px] flex-1 bg-card"
        >
          <SelectValue placeholder="Default order" />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="name" className="text-[12.5px]">
            Item
          </SelectItem>
          {columns.map((column) => (
            <SelectItem
              key={column.key}
              value={column.key}
              className="text-[12.5px]"
            >
              {column.label}
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
          onClick={() => onToggleSort(sortKey)}
        >
          <DirectionIcon className="h-3.5 w-3.5" />
        </Button>
      )}
    </div>
  );
}

interface AuditMobileTotalsBarProps {
  diffQty: number;
  diffCost: number;
  diffSelling: number;
  canViewCost: boolean;
}

export function AuditMobileTotalsBar({
  diffQty,
  diffCost,
  diffSelling,
  canViewCost,
}: AuditMobileTotalsBarProps) {
  return (
    <div className="mt-3 rounded-2xl border border-border bg-muted/30 p-3 grid grid-cols-2 gap-2.5 text-xs">
      <div>
        <div className="text-[10.5px] uppercase text-muted-foreground font-semibold">
          Net Diff Qty
        </div>
        <div className={`text-[14px] font-bold mt-0.5 ${diffClassName(diffQty, true)}`}>
          {diffQty > 0 ? `+${diffQty}` : diffQty}
        </div>
      </div>
      {canViewCost && (
        <div>
          <div className="text-[10.5px] uppercase text-muted-foreground font-semibold">
            Net Diff Cost
          </div>
          <div className={`text-[14px] font-bold mt-0.5 ${diffClassName(diffCost, true)}`}>
            {formatDiffCurrency(diffCost)}
          </div>
        </div>
      )}
      <div>
        <div className="text-[10.5px] uppercase text-muted-foreground font-semibold">
          Net Diff Selling
        </div>
        <div className={`text-[14px] font-bold mt-0.5 ${diffClassName(diffSelling, true)}`}>
          {formatDiffCurrency(diffSelling)}
        </div>
      </div>
    </div>
  );
}

interface AuditDesktopTableProps {
  items: AuditItem[];
  displayedColumns: { label: string; key: AuditSortKey }[];
  canViewCost: boolean;
  canEditProductCost: boolean;
  canEditProductPrice: boolean;
  isReadOnly: boolean;
  sortKey: AuditSortKey | null;
  direction: SortDirection;
  toggleSort: (key: AuditSortKey) => void;
  totals: { diffQty: number; diffCost: number; diffSelling: number };
  selectedCategory: string;
  countStatus: AuditCountStatus;
  search: string;
  hasActiveFilters: boolean;
  onClearFilters: () => void;
  onUpdateItem: (id: string, patch: Partial<AuditItem>) => void;
  onCountRow: (id: string, countedQty?: number) => void;
  onClearCount: (id: string) => void;
  rowsContainerRef: React.RefObject<HTMLDivElement | null>;
  rowVirtualizer: ReturnType<typeof useVirtualizer<HTMLDivElement, Element>>;
  scrollMargin: number;
}

export function AuditDesktopTable({
  items,
  displayedColumns,
  canViewCost,
  canEditProductCost,
  canEditProductPrice,
  isReadOnly,
  sortKey,
  direction,
  toggleSort,
  totals,
  selectedCategory,
  countStatus,
  search,
  hasActiveFilters,
  onClearFilters,
  onUpdateItem,
  onCountRow,
  onClearCount,
  rowsContainerRef,
  rowVirtualizer,
  scrollMargin,
}: AuditDesktopTableProps) {
  const gridCols = getAuditLedgerGridCols(canViewCost);

  return (
    <div className="border border-border rounded-xl overflow-x-auto">
      <div
        role="table"
        aria-label="Physical inventory count"
        className="w-full text-[12.5px]"
      >
        <div role="rowgroup">
          <div
            role="row"
            className={`grid ${gridCols} bg-muted/40 text-muted-foreground text-[11px] uppercase font-semibold`}
          >
            <div
              role="columnheader"
              className="text-left px-3 py-2 sticky left-0 z-10 bg-muted"
            >
              <SortableHeaderCell
                label="Item"
                active={sortKey === "name"}
                direction={direction}
                onClick={() => toggleSort("name")}
              />
            </div>
            {displayedColumns.map((column) => (
              <div
                key={column.key}
                role="columnheader"
                className="text-right px-3 py-2"
              >
                <SortableHeaderCell
                  label={column.label}
                  active={sortKey === column.key}
                  direction={direction}
                  onClick={() => toggleSort(column.key)}
                  className="justify-end"
                />
              </div>
            ))}
          </div>
        </div>

        <div
          role="rowgroup"
          ref={rowsContainerRef}
          className="relative"
          style={{
            height: items.length > 0 ? rowVirtualizer.getTotalSize() : undefined,
          }}
        >
          {rowVirtualizer.getVirtualItems().map((virtualRow) => {
            const item = items[virtualRow.index];
            if (!item) return null;

            return (
              <div
                key={item.id}
                role="row"
                data-index={virtualRow.index}
                ref={rowVirtualizer.measureElement}
                className={`grid ${gridCols} bg-card hover:bg-accent/10 absolute top-0 left-0 w-full border-b border-border`}
                style={{
                  transform: `translateY(${virtualRow.start - scrollMargin}px)`,
                }}
              >
                <AuditLedgerRowCells
                  item={item}
                  canEditProductCost={canEditProductCost}
                  canEditProductPrice={canEditProductPrice}
                  canViewCost={canViewCost}
                  isReadOnly={isReadOnly}
                  onUpdateItem={onUpdateItem}
                  onCountRow={onCountRow}
                  onClearCount={onClearCount}
                />
              </div>
            );
          })}
          {items.length === 0 && (
            <div role="row" className={`grid ${gridCols}`}>
              <div role="cell" className={canViewCost ? "col-span-11" : "col-span-8"}>
                <EmptyState
                  icon={SearchX}
                  title="No items match"
                  description="Try a different search term or category."
                  action={
                    hasActiveFilters
                      ? { label: "Clear filters", onClick: onClearFilters }
                      : undefined
                  }
                />
              </div>
            </div>
          )}
        </div>

        {items.length > 0 && (
          <div role="rowgroup">
            <AuditLedgerTotalsRow
              totals={totals}
              selectedCategory={selectedCategory}
              countStatus={countStatus}
              search={search}
              canViewCost={canViewCost}
            />
          </div>
        )}
      </div>
    </div>
  );
}
