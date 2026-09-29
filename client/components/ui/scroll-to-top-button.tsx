"use client";

import { useEffect, useState, type RefObject } from "react";
import { createPortal } from "react-dom";
import { ArrowUp } from "lucide-react";

interface ScrollToTopButtonProps {
  /** The virtualized list's own scroll container - the same ref its
   * virtualizer already holds, so the button can never track a different
   * element than the one that actually scrolls. */
  scrollRef: RefObject<HTMLDivElement | null>;
  /** How many viewport heights the user must scroll before it appears. */
  viewportsBeforeShowing?: number;
  label?: string;
}

/**
 * Long virtualized lists have no way back to the top short of flicking for
 * several seconds; there is no "scroll to bottom" counterpart because the
 * end of a list is not a destination anyone asks for here.
 *
 * Positioned as a portaled fixed element measured off the scroll container's
 * own bounding rect, rather than an absolutely positioned child: the lists
 * this drops into sit inside cards and panels with their own overflow and
 * transform contexts, either of which would clip or re-anchor a plain
 * absolute/fixed child.
 */
export function ScrollToTopButton({
  scrollRef,
  viewportsBeforeShowing = 2,
  label = "Scroll back to top",
}: ScrollToTopButtonProps) {
  const [position, setPosition] = useState<{ bottom: number; right: number } | null>(
    null,
  );
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;

    const update = () => {
      setVisible(el.scrollTop > el.clientHeight * viewportsBeforeShowing);
      const rect = el.getBoundingClientRect();
      setPosition({
        bottom: Math.max(16, window.innerHeight - rect.bottom + 16),
        right: Math.max(16, window.innerWidth - rect.right + 16),
      });
    };

    update();
    el.addEventListener("scroll", update, { passive: true });
    window.addEventListener("resize", update);
    const observer =
      typeof ResizeObserver === "undefined" ? null : new ResizeObserver(update);
    observer?.observe(el);
    return () => {
      el.removeEventListener("scroll", update);
      window.removeEventListener("resize", update);
      observer?.disconnect();
    };
  }, [scrollRef, viewportsBeforeShowing]);

  if (!visible || !position || typeof document === "undefined") return null;

  return createPortal(
    <button
      type="button"
      aria-label={label}
      title={label}
      onClick={() =>
        scrollRef.current?.scrollTo({ top: 0, behavior: "smooth" })
      }
      style={{ position: "fixed", bottom: position.bottom, right: position.right }}
      className="z-40 h-10 w-10 rounded-full bg-primary text-primary-foreground shadow-lg flex items-center justify-center hover:bg-primary/90 transition-colors outline-none focus-visible:ring-[3px] focus-visible:ring-ring"
    >
      <ArrowUp className="h-4 w-4" />
    </button>,
    document.body,
  );
}
