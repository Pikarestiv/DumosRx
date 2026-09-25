"use client";

import { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { useVirtualizer } from "@tanstack/react-virtual";
import { POSProductCard, type GroupedProduct } from "./pos-product-list";
import type { POSProduct } from "@/lib/types/product";

// Mirrors the grid's previous fixed classes (grid-cols-2 sm:grid-cols-3
// lg:grid-cols-3 xl:grid-cols-4 — lg is a no-op, already 3 from sm) as
// *viewport* breakpoints, matching Tailwind's own defaults: those classes
// respond to the browser viewport, not this element's own width, so
// columns here must be computed the same way, not via a ResizeObserver on
// this container. Mismatching the two would desync how many cards this
// component groups into a virtualized row from how many the CSS grid
// actually renders per row, breaking the layout.
const COLUMN_BREAKPOINTS = [
  { minWidth: 1280, columns: 4 },
  { minWidth: 640, columns: 3 },
  { minWidth: 0, columns: 2 },
];

function computeColumns(viewportWidth: number): number {
  return (
    COLUMN_BREAKPOINTS.find((b) => viewportWidth >= b.minWidth)?.columns ?? 2
  );
}

function useResponsiveColumns(): number {
  const [columns, setColumns] = useState(() =>
    typeof window === "undefined" ? 2 : computeColumns(window.innerWidth),
  );

  useEffect(() => {
    const onResize = () => setColumns(computeColumns(window.innerWidth));
    onResize();
    window.addEventListener("resize", onResize);
    return () => window.removeEventListener("resize", onResize);
  }, []);

  return columns;
}

interface VirtualizedProductGridProps {
  products: GroupedProduct[];
  currencyCode?: string;
  addToCart: (product: POSProduct) => void;
  cartQuantityMap: Map<string, number>;
  displayStockLevels?: boolean;
  /** The single scrollable ancestor this grid renders inside of (POS's
   * products tab shares one scroll container across the category filter,
   * mobile search, suggestion carousels, and this grid — see
   * pos-system.tsx). react-virtual needs that real scroll element, not a
   * new one of its own, or pull-to-refresh and the page's own scrollbar
   * would both break. */
  scrollElementRef: React.RefObject<HTMLDivElement | null>;
  className?: string;
}

/**
 * Row-virtualized replacement for a plain `products.map(...)` CSS grid —
 * see docs/KNOWN_BUGS.md's POS perf finding. Every other large list in the
 * app (catalog, customers, expenses, ...) already virtualizes; POS's
 * product grid didn't, so a large catalog (thousands of products) rendered
 * every card as a real DOM node at once, on both the "All products" browse
 * view and every search-result set — the most expensive screen in the app
 * to have doing that, since it's also the one re-rendering on every
 * keystroke while searching.
 *
 * Chunks the flat product list into rows of `columns` items (computed to
 * match the grid's own responsive breakpoints, see COLUMN_BREAKPOINTS) and
 * only mounts the rows currently in or near the viewport.
 */
export function VirtualizedProductGrid({
  products,
  currencyCode,
  addToCart,
  cartQuantityMap,
  displayStockLevels,
  scrollElementRef,
  className,
}: VirtualizedProductGridProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const columns = useResponsiveColumns();

  const rows = useMemo(() => {
    const out: GroupedProduct[][] = [];
    for (let i = 0; i < products.length; i += columns) {
      out.push(products.slice(i, i + columns));
    }
    return out;
  }, [products, columns]);

  // How far this grid sits below the top of the shared scroll container
  // (category filter, mobile search, any suggestion/recently-sold
  // carousels above it) — react-virtual's `scrollMargin` needs this to
  // translate its own row offsets into the scroll container's actual
  // coordinate space. Content above this grid can change height for
  // reasons that have nothing to do with this grid's OWN row count — the
  // Smart Suggestions section switches between a one-liner and a full
  // card carousel as the cart changes, the category filter/search can
  // rewrap, the pull-to-refresh indicator animates — so recomputing only
  // on `rows.length` left `scrollMargin` stale exactly when the cart or
  // filters changed without also changing how many products matched:
  // every virtual row then drew at the wrong offset against a scroll
  // container measuring something else, a mis-rendered grid mid-checkout.
  // Recomputed after every render instead (any layout-affecting change,
  // including ones this component has no explicit dependency on) — cheap
  // (one offsetTop read) and self-limiting: setState is a no-op once the
  // value stops changing, so this can't loop.
  const [scrollMargin, setScrollMargin] = useState(0);
  // Deliberately no deps array: this must re-check on every render,
  // including ones this component has no explicit dependency for (see the
  // comment above). The `!==` guard is what actually prevents a loop, not
  // a deps array — adding [scrollMargin] would make this only re-run when
  // scrollMargin itself changes, defeating the point.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useLayoutEffect(() => {
    if (containerRef.current && containerRef.current.offsetTop !== scrollMargin) {
      setScrollMargin(containerRef.current.offsetTop);
    }
  });

  const rowVirtualizer = useVirtualizer({
    count: rows.length,
    getScrollElement: () => scrollElementRef.current,
    // A card's height is fairly stable (name is line-clamped to 2 lines),
    // so a fixed estimate keyed off breakpoint is close enough that
    // measureElement below only needs to correct it slightly, not
    // recompute from scratch.
    estimateSize: () => (columns <= 2 ? 112 : 140),
    overscan: 6,
    scrollMargin,
  });

  return (
    <div
      ref={containerRef}
      className={className}
      style={{ position: "relative", width: "100%", height: rowVirtualizer.getTotalSize() }}
    >
      {rowVirtualizer.getVirtualItems().map((virtualRow) => {
        const row = rows[virtualRow.index];
        if (!row) return null;
        return (
          <div
            key={virtualRow.key}
            data-index={virtualRow.index}
            ref={rowVirtualizer.measureElement}
            className="absolute top-0 left-0 w-full gap-2 sm:gap-3 pb-2 sm:pb-3"
            style={{
              display: "grid",
              gridTemplateColumns: `repeat(${columns}, minmax(0, 1fr))`,
              transform: `translateY(${virtualRow.start - scrollMargin}px)`,
            }}
          >
            {row.map((product) => (
              <POSProductCard
                key={product.id}
                product={product}
                currencyCode={currencyCode}
                addToCart={addToCart}
                cartQuantity={cartQuantityMap.get(product.id) || 0}
                displayStockLevels={displayStockLevels}
              />
            ))}
          </div>
        );
      })}
    </div>
  );
}
