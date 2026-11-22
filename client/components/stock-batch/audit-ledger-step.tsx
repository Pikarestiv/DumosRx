import { useLayoutEffect, useMemo, useRef, useState } from "react";
import { useVirtualizer } from "@tanstack/react-virtual";
import { Search, SearchX } from "lucide-react";
import { Input } from "@/components/ui/input";
import { SearchClearButton } from "@/components/ui/search-input";
import { FilterPill } from "@/components/ui/filter-pill";
import { useHasPermission } from "@/lib/hooks/use-permissions";
import { EmptyState } from "@/components/ui/empty-state";
import type { AuditItem } from "./stock-audits";
import { type AuditCountStatus, type AuditSortKey } from "./audit-derivations";
import { AuditMobileCard } from "./audit-mobile-card";
import {
  AuditDesktopTable,
  AuditMobileSortBar,
  AuditMobileTotalsBar,
} from "./audit-ledger-views";
import { useMediaQuery } from "@/hooks/use-media-query";
import type { SortDirection } from "@/lib/hooks/use-sortable-data";
import { isBlockedBySync, type PreAuditSync } from "@/lib/hooks/use-pre-audit-sync";
import { AuditPresyncPanel } from "./audit-presync-panel";

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
  presync: PreAuditSync;
  isReadOnly?: boolean;
  onUpdateItem: (id: string, patch: Partial<AuditItem>) => void;
  onCountRow: (id: string, countedQty?: number) => void;
  onClearCount: (id: string) => void;
  categories: { id: string; label: string; count: number }[];
  selectedCategory: string;
  setSelectedCategory: (category: string) => void;
  countStatus: AuditCountStatus;
  setCountStatus: (status: AuditCountStatus) => void;
  countedCount: number;
  search: string;
  setSearch: (val: string) => void;
  scrollElementRef: React.RefObject<HTMLDivElement | null>;
  sort: {
    sortKey: AuditSortKey | null;
    direction: SortDirection;
    toggleSort: (key: AuditSortKey) => void;
  };
}

export function AuditLedgerStep({
  items,
  totalItems,
  isLoading,
  presync,
  isReadOnly = false,
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
  const canViewCost = useHasPermission("view_cost_fields");
  const canEditProductCost = useHasPermission("edit_product_cost");
  const canEditProductPrice = useHasPermission("edit_product_price");
  const isDesktop = useMediaQuery("(min-width: 1024px)");
  const displayedColumns = useMemo(
    () =>
      canViewCost
        ? LEDGER_COLUMNS
        : LEDGER_COLUMNS.filter(
            (c) =>
              c.key !== "costPrice" &&
              c.key !== "countedCost" &&
              c.key !== "diffCost",
          ),
    [canViewCost],
  );
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
  const blockedBySync = isBlockedBySync(presync);
  const hasActiveFilters =
    selectedCategory !== ALL_CATEGORIES ||
    countStatus !== "all" ||
    search.trim().length > 0;
  const clearFilters = () => {
    setSelectedCategory(ALL_CATEGORIES);
    setCountStatus("all");
    setSearch("");
  };

  const rowsContainerRef = useRef<HTMLDivElement>(null);
  const [scrollMargin, setScrollMargin] = useState(0);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useLayoutEffect(() => {
    const top = rowsContainerRef.current?.offsetTop;
    if (top !== undefined && top !== scrollMargin) setScrollMargin(top);
  });

  const rowVirtualizer = useVirtualizer({
    count: items.length,
    getScrollElement: () => scrollElementRef.current,
    estimateSize: () => (isDesktop ? LEDGER_ROW_HEIGHT : 196),
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
        {!blockedBySync &&
          `(${items.length} of ${totalItems} item${totalItems === 1 ? "" : "s"} shown, ${countedCount} counted)`}
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
            className={`pl-9 ${search ? "pr-8" : ""} h-9 text-[13px]`}
          />
          {search && <SearchClearButton onClick={() => setSearch("")} />}
        </div>
      </div>

      <AuditPresyncPanel presync={presync} isReadOnly={isReadOnly} />

      {isLoading && !blockedBySync && (
        <div className="text-center p-8 text-muted-foreground">
          Loading items...
        </div>
      )}

      {!isLoading && !blockedBySync && !isDesktop && (
        <div>
          {items.length > 0 && (
            <AuditMobileSortBar
              columns={displayedColumns}
              sortKey={sortKey}
              direction={direction}
              onToggleSort={toggleSort}
            />
          )}

          {items.length === 0 ? (
            <EmptyState
              icon={SearchX}
              title="No items match"
              description="Try a different search term or category."
              action={
                hasActiveFilters
                  ? { label: "Clear filters", onClick: clearFilters }
                  : undefined
              }
            />
          ) : (
            <>
              <div
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
                      data-index={virtualRow.index}
                      ref={rowVirtualizer.measureElement}
                      className="absolute top-0 left-0 w-full pb-2.5"
                      style={{
                        transform: `translateY(${virtualRow.start - scrollMargin}px)`,
                      }}
                    >
                      <AuditMobileCard
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
              </div>

              <AuditMobileTotalsBar
                diffQty={totals.diffQty}
                diffCost={totals.diffCost}
                diffSelling={totals.diffSelling}
                canViewCost={canViewCost}
              />
            </>
          )}
        </div>
      )}

      {!isLoading && !blockedBySync && isDesktop && (
        <AuditDesktopTable
          items={items}
          displayedColumns={displayedColumns}
          canViewCost={canViewCost}
          canEditProductCost={canEditProductCost}
          canEditProductPrice={canEditProductPrice}
          isReadOnly={isReadOnly}
          sortKey={sortKey}
          direction={direction}
          toggleSort={toggleSort}
          totals={totals}
          selectedCategory={selectedCategory}
          countStatus={countStatus}
          search={search}
          hasActiveFilters={hasActiveFilters}
          onClearFilters={clearFilters}
          onUpdateItem={onUpdateItem}
          onCountRow={onCountRow}
          onClearCount={onClearCount}
          rowsContainerRef={rowsContainerRef}
          rowVirtualizer={rowVirtualizer}
          scrollMargin={scrollMargin}
        />
      )}
    </div>
  );
}
