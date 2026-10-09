import { useEffect, useRef, useState } from "react";

interface HasQuantity {
  id: string;
  quantity: number;
}

/**
 * Keeps the cart line a cashier just affected in view, and marks it briefly.
 *
 * The cart is a receipt in progress, so its order stays exactly as rung up —
 * only the viewport moves, and only when the line is actually off-screen.
 * Keyed off the quantity rising rather than a tap handler so a card tap, a
 * barcode scan, a search result and a suggestion chip all behave the same.
 */
export function useRevealChangedCartLine<T extends HasQuantity>(items: T[]) {
  const listRef = useRef<HTMLDivElement>(null);
  const [revealedId, setRevealedId] = useState<string | null>(null);
  const previousQuantities = useRef<Map<string, number> | null>(null);

  useEffect(() => {
    const previous = previousQuantities.current;
    const current = new Map<string, number>(
      items.map((item) => [item.id, item.quantity] as const),
    );
    previousQuantities.current = current;

    // First run has no baseline; a restored cart is not a fresh add.
    if (previous === null) return;

    let changedId: string | null = null;
    for (const [id, quantity] of current) {
      if (quantity > (previous.get(id) ?? 0)) {
        changedId = id;
        break;
      }
    }

    // A decrement or removal must clear the mark, or it sticks on a line the
    // cashier has since corrected.
    if (changedId === null) {
      setRevealedId(null);
      return;
    }

    setRevealedId(changedId);
    const clearHighlight = setTimeout(() => setRevealedId(null), 1200);

    const container = listRef.current;
    const line = container?.querySelector<HTMLElement>(
      `[data-cart-item-id="${changedId}"]`,
    );

    if (container && line) {
      const lineTop = line.offsetTop - container.offsetTop;
      const lineBottom = lineTop + line.offsetHeight;
      const viewTop = container.scrollTop;
      const viewBottom = viewTop + container.clientHeight;

      if (lineTop < viewTop || lineBottom > viewBottom) {
        line.scrollIntoView({ block: "nearest", behavior: "smooth" });
      }
    }

    return () => clearTimeout(clearHighlight);
  }, [items]);

  return { listRef, revealedId };
}
