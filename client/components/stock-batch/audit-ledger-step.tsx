import { useLayoutEffect, useMemo, useRef, useState } from "react";
import { useVirtualizer } from "@tanstack/react-virtual";
import { Search, SearchX } from "lucide-react";
import { Input } from "@/components/ui/input";
import { FilterPill } from "@/components/ui/filter-pill";
import { useHasPermission } from "@/lib/hooks/use-permissions";
import { EmptyState } from "@/components/ui/empty-state";
import { SortableHeaderCell } from "@/components/ui/sortable-header-cell";
import type { AuditItem } from "./stock-audits";
import { type AuditCountStatus, type AuditSortKey } from "./audit-derivations";
import { AUDIT_LEDGER_GRID_COLS as GRID_COLS } from "./audit-ledger-format";
import { AuditLedgerRowCells } from "./audit-ledger-row-cells";
import { AuditLedgerTotalsRow } from "./audit-ledger-totals-row";
import type { SortDirection } from "@/lib/hooks/use-sortable-data";

const ALL_CATEGORIES = "__all__";
const LEDGER_ROW_HEIGHT = 49;

const LEDGER_COLUMNS: { label: string; key: AuditSortKey }[] = [
  { label: "Counted Qty", key: "countedQty" },
  { label: "System Qty", key: "systemQty" },
  { label: "Diff Qty", key: "diffQty" },
  { label: "Cost Price", key: "costPrice" },
  { label: "Counted Cost", key: "countedCost" },
  { label: "Diff Cost", key: "diffCost" },
  { label: "Selling Price", key: "sellingPrice" },
  { label: "Counted Selling", key: "countedSelling" },
  { label: "Diff Selling", key: "diffSelling" },
  { label: "Last Counted", key: "lastAuditedAt" },
];

interface AuditLedgerStepProps {
  items: AuditItem[];
  totalItems: number;
  isLoading: boolean;
  isSyncing: boolean;
  onUpdateItem: (id: string, patch: Partial<AuditItem>) => void;
  /** Records a count and re-baselines the row against live stock (A-263). */
  onCountRow: (id: string, countedQty?: number) => void;
  /** Drops a re-read still in flight, so it cannot re-count a cleared row. */
  onClearCount: (id: string) => void;
  categories: { id: string; label: string; count: number }[];
  selectedCategory: string;
  setSelectedCategory: (category: string) => void;
  countStatus: AuditCountStatus;
  setCountStatus: (status: AuditCountStatus) => void;
  /** Rows counted across the whole audit, not just the filtered slice. */
  countedCount: number;
  search: string;
  setSearch: (val: string) => void;
  /** The screen's own scroll region; react-virtual needs the real one. */
  scrollElementRef: React.RefObject<HTMLDivElement | null>;
  sort: {
    sortKey: AuditSortKey | null;
    direction: SortDirection;
    toggleSort: (key: AuditSortKey) => void;
  };
}

// Dense, single-screen count flow; the filters are lenses, not scope gates.
// Rationale: docs/CLIENT_COMMENTS.md#block-components-stock-batch-audit-ledger-step-tsx-ledger
export function AuditLedgerStep({
  items,
  totalItems,
  isLoading,
  isSyncing,
  onUpdateItem,
  onCountRow,
  onClearCount,
  categories,
  selectedCategory,
  setSelectedCategory,
  countStatus,
  setCountStatus,
  countedCount,
  search,
  setSearch,
  scrollElementRef,
  sort,
}: AuditLedgerStepProps) {
  const canEditProductCost = useHasPermission("edit_product_cost");
  const canEditProductPrice = useHasPermission("edit_product_price");
  // Totals cover the rows shown, so a filtered view gets a live subtotal.
  const totals = useMemo(
    () =>
      items.reduce(
        (acc, item) => {
          const countedQty = item.countedQty ?? item.systemQty;
          const diffQty = countedQty - item.systemQty;
          acc.diffQty += diffQty;
          acc.diffCost +=
            item.costPrice !== undefined ? diffQty * item.costPrice : 0;
          acc.diffSelling +=
            item.sellingPrice !== undefined ? diffQty * item.sellingPrice : 0;
          return acc;
        },
        { diffQty: 0, diffCost: 0, diffSelling: 0 },
      ),
    [items],
  );

  const { sortKey, direction, toggleSort } = sort;

  const rowsContainerRef = useRef<HTMLDivElement>(null);
  const [scrollMargin, setScrollMargin] = useState(0);
  // No deps array on purpose; the !== guard prevents a loop.
  // Rationale: docs/CLIENT_COMMENTS.md#block-components-stock-batch-audit-ledger-step-tsx-scroll-margin
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useLayoutEffect(() => {
    const top = rowsContainerRef.current?.offsetTop;
    if (top !== undefined && top !== scrollMargin) setScrollMargin(top);
  });

  const rowVirtualizer = useVirtualizer({
    count: items.length,
    getScrollElement: () => scrollElementRef.current,
    estimateSize: () => LEDGER_ROW_HEIGHT,
    overscan: 10,
    scrollMargin,
  });

  return (
    <div className="animate-in fade-in slide-in-from-bottom-4 duration-300 pb-4">
      <div className="text-[17px] font-semibold mb-1.5">Physical inventory</div>
      <div className="text-[13px] text-muted-foreground mb-4">
        Counted Qty starts empty: type what you actually counted, or tick a
        row whose count matched the system. Each entry is checked against
        stock as it stands at that moment.{" "}
        {isSyncing
          ? "Syncing latest stock levels…"
          : `(${items.length} of ${totalItems} item${totalItems === 1 ? "" : "s"} shown, ${countedCount} counted)`}
      </div>

      <div className="flex items-center gap-2 flex-wrap mb-4">
        <FilterPill
          label="Category"
          value={selectedCategory}
          onValueChange={setSelectedCategory}
          allValue={ALL_CATEGORIES}
          options={[
            { value: ALL_CATEGORIES, label: "All Categories" },
            ...categories.map((c) => ({
              value: c.id,
              label: `${c.label} (${c.count})`,
            })),
          ]}
        />
        <FilterPill
          label="Count"
          value={countStatus}
          onValueChange={(value) => setCountStatus(value as AuditCountStatus)}
          allValue="all"
          options={[
            { value: "all", label: "All Items" },
            { value: "counted", label: "Counted" },
            { value: "uncounted", label: "Not Counted" },
            { value: "differences", label: "Qty Differences" },
          ]}
        />
        <div className="relative flex-1 min-w-[160px]">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground pointer-events-none" />
          <Input
            placeholder="Search by name or SKU"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-9 h-9 text-[13px]"
          />
        </div>
      </div>

      {isLoading && (
        <div className="text-center p-8 text-muted-foreground">
          Loading items...
        </div>
      )}

      {!isLoading && (
        <div className="border border-border rounded-xl overflow-x-auto">
          <div
            role="table"
            aria-label="Physical inventory count"
            className="w-full text-[12.5px]"
          >
            <div role="rowgroup">
              <div
                role="row"
                className={`grid ${GRID_COLS} bg-muted/40 text-muted-foreground text-[11px] uppercase font-semibold`}
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
                {LEDGER_COLUMNS.map((column) => (
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
                    className={`grid ${GRID_COLS} hover:bg-accent/10 absolute top-0 left-0 w-full border-b border-border`}
                    style={{
                      transform: `translateY(${virtualRow.start - scrollMargin}px)`,
                    }}
                  >
                    <AuditLedgerRowCells
                      item={item}
                      canEditProductCost={canEditProductCost}
                      canEditProductPrice={canEditProductPrice}
                      onUpdateItem={onUpdateItem}
                      onCountRow={onCountRow}
                      onClearCount={onClearCount}
                    />
                  </div>
                );
              })}
              {items.length === 0 && (
                <div role="row" className={`grid ${GRID_COLS}`}>
                  <div role="cell" className="col-span-11">
                    <EmptyState
                      icon={SearchX}
                      title="No items match"
                      description="Try a different search term or category."
                      action={
                        selectedCategory !== ALL_CATEGORIES ||
                        countStatus !== "all" ||
                        search.trim().length > 0
                          ? {
                              label: "Clear filters",
                              onClick: () => {
                                setSelectedCategory(ALL_CATEGORIES);
                                setCountStatus("all");
                                setSearch("");
                              },
                            }
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
                />
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
