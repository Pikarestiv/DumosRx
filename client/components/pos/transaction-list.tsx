import React from 'react';
import { Receipt } from 'lucide-react';
import { useVirtualizer } from '@tanstack/react-virtual';
import { TransactionItem } from './transaction-item';
import { EmptyState } from '@/components/ui/empty-state';
import { useAuth } from '@/lib/context/auth-context';
import type { SaleWithDetails } from '@/lib/types/sale';

/** Estimate only - each row measures itself once rendered (a row's height
 * varies with its badges and the Return button). */
const ESTIMATED_ROW_HEIGHT = 84;
const ESTIMATED_HEADER_HEIGHT = 32;

function NoRecentSalesFound() {
  const { user } = useAuth();
  const isAuditor = user?.role === "auditor";
  return (
    <div className="border rounded-xl border-dashed">
      <EmptyState
        icon={Receipt}
        title="No recent sales found"
        action={isAuditor ? undefined : { label: "Go to POS", href: "/pos" }}
      />
    </div>
  );
}

export type TransactionListEntry =
  | { type: "header"; label: string }
  | { type: "row"; sale: SaleWithDetails };

/** Flattens the TODAY/YESTERDAY/THIS WEEK/OLDER buckets into one list so a
 * single virtualizer can cover the whole thing (up to 500 rows once a date
 * range is picked) instead of one per group. Empty groups drop out entirely,
 * header included. */
export function flattenGroupedSales(groupedSales: {
  [key: string]: SaleWithDetails[];
}): TransactionListEntry[] {
  const entries: TransactionListEntry[] = [];
  for (const [label, sales] of Object.entries(groupedSales)) {
    if (!sales || sales.length === 0) continue;
    entries.push({ type: "header", label });
    for (const sale of sales) entries.push({ type: "row", sale });
  }
  return entries;
}

interface TransactionListProps {
  groupedSales: { [key: string]: SaleWithDetails[] };
  currencyCode?: string;
  canReturn?: boolean;
  onSelectSale: (sale: SaleWithDetails) => void;
  onReturnClick: (sale: SaleWithDetails) => void;
  hasFilters: boolean;
  /** The ancestor that actually scrolls (the History tab's TabsContent). The
   * list has no scroll container of its own, so the virtualizer measures
   * against this and offsets by the list's position inside it. */
  scrollElementRef: React.RefObject<HTMLDivElement | null>;
}

export function TransactionList({
  groupedSales,
  currencyCode,
  canReturn,
  onSelectSale,
  onReturnClick,
  hasFilters,
  scrollElementRef,
}: TransactionListProps) {
  const listRef = React.useRef<HTMLDivElement>(null);
  const entries = React.useMemo(
    () => flattenGroupedSales(groupedSales),
    [groupedSales],
  );

  const virtualizer = useVirtualizer({
    count: entries.length,
    getScrollElement: () => scrollElementRef.current,
    estimateSize: (index) =>
      entries[index]?.type === "header"
        ? ESTIMATED_HEADER_HEIGHT
        : ESTIMATED_ROW_HEIGHT,
    overscan: 8,
    // Everything above this list inside the same scroll container (the
    // metrics row, the filter bar) still occupies real space, so the
    // virtualizer's offsets have to start where the list itself does.
    scrollMargin: listRef.current?.offsetTop ?? 0,
  });

  if (hasFilters) {
    return <NoRecentSalesFound />;
  }

  return (
    <div ref={listRef} className="pb-6">
      <div
        className="relative w-full"
        style={{ height: virtualizer.getTotalSize() }}
      >
        {virtualizer.getVirtualItems().map((virtualRow) => {
          const entry = entries[virtualRow.index];
          if (!entry) return null;
          return (
            <div
              key={entry.type === "header" ? `h-${entry.label}` : entry.sale.id}
              data-index={virtualRow.index}
              ref={virtualizer.measureElement}
              className="absolute top-0 left-0 w-full"
              style={{
                transform: `translateY(${virtualRow.start - virtualizer.options.scrollMargin}px)`,
              }}
            >
              {entry.type === "header" ? (
                <h3 className="text-xs font-semibold text-muted-foreground tracking-wider uppercase pl-1 pt-3 pb-2">
                  {entry.label}
                </h3>
              ) : (
                <div className="pb-3">
                  <TransactionItem
                    sale={entry.sale}
                    currencyCode={currencyCode}
                    canReturn={canReturn}
                    onSelect={onSelectSale}
                    onReturnClick={onReturnClick}
                  />
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
