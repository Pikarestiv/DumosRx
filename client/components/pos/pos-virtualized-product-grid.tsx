"use client";

import { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { useVirtualizer } from "@tanstack/react-virtual";
import { POSProductCard, type GroupedProduct } from "./pos-product-card";
import type { POSProduct } from "@/lib/types/product";

// Mirrors the grid's previous fixed classes (grid-cols-2 sm:grid-cols-3 lg:grid-cols-3 xl:grid-cols-4 — lg is a no-op, alr…
// Rationale: docs/CLIENT_COMMENTS.md#line-components-pos-pos-virtualized-product-grid-tsx-L8
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
  // The single scrollable ancestor this grid renders inside of (POS's products tab shares one scroll container across the ca…
  // Rationale: docs/CLIENT_COMMENTS.md#block-components-pos-pos-virtualized-product-grid-tsx-L49
  scrollElementRef: React.RefObject<HTMLDivElement | null>;
  className?: string;
}

// Row-virtualized replacement for a plain `products.map(...)` CSS grid — see docs/KNOWN_BUGS.md's POS perf finding.
// Rationale: docs/CLIENT_COMMENTS.md#block-components-pos-pos-virtualized-product-grid-tsx-L59
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

  // How far this grid sits below the top of the shared scroll container (category filter, mobile search, any suggestion/rece…
  // Rationale: docs/CLIENT_COMMENTS.md#line-components-pos-pos-virtualized-product-grid-tsx-L93
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
    // A card's height is fairly stable (name is line-clamped to 2 lines), so a fixed estimate keyed off breakpoint is close en…
    // Rationale: docs/CLIENT_COMMENTS.md#line-components-pos-pos-virtualized-product-grid-tsx-L126
    estimateSize: () => (columns <= 2 ? 112 : 140),
    overscan: 6,
    scrollMargin,
  });

  // Reveal a product the moment its cart quantity goes up, wherever the add came from — a card tap, a barcode scan, the sear…
  // Rationale: docs/CLIENT_COMMENTS.md#line-components-pos-pos-virtualized-product-grid-tsx-L135
  const previousQuantities = useRef<Map<string, number> | null>(null);

  useEffect(() => {
    const previous = previousQuantities.current;
    previousQuantities.current = new Map(cartQuantityMap);

    // First run has no baseline: a restored cart is not a fresh add.
    if (previous === null) return;

    let addedId: string | null = null;
    for (const [id, quantity] of cartQuantityMap) {
      if (quantity > (previous.get(id) ?? 0)) {
        addedId = id;
        break;
      }
    }
    if (addedId === null) return;

    const productIndex = products.findIndex((product) => product.id === addedId);
    if (productIndex < 0) return;

    const rowIndex = Math.floor(productIndex / columns);
    const alreadyVisible = rowVirtualizer
      .getVirtualItems()
      .some((row) => row.index === rowIndex);
    if (alreadyVisible) return;

    rowVirtualizer.scrollToIndex(rowIndex, { align: "center" });
  }, [cartQuantityMap, products, columns, rowVirtualizer]);

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
