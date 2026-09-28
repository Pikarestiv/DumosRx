"use client";

import { useCallback, useEffect, useRef, useState, type ReactNode } from "react";
import { cn } from "@/lib/utils";

interface ScrollFadeProps {
  children: ReactNode;
  /** Classes for the scrollable element itself (padding, flex sizing, etc). */
  className?: string;
  /** Classes for the positioning wrapper (must participate correctly in the parent's flex/height layout). */
  containerClassName?: string;
}

/**
 * Wraps a scrollable region and shows a top/bottom fade whenever content is
 * clipped, so users don't mistake a scrolled-off item for a missing one.
 */
export function ScrollFade({ children, className, containerClassName }: ScrollFadeProps) {
  const scrollRef = useRef<HTMLDivElement>(null);
  // Content grows asynchronously (data loads after mount) without the
  // scroll container's own box size changing, so we watch the unclipped
  // content wrapper instead: that's what actually reflects scrollHeight.
  const contentRef = useRef<HTMLDivElement>(null);
  const [showTop, setShowTop] = useState(false);
  const [showBottom, setShowBottom] = useState(false);

  const updateFades = useCallback(() => {
    const el = scrollRef.current;
    if (!el) return;
    setShowTop(el.scrollTop > 4);
    setShowBottom(el.scrollTop + el.clientHeight < el.scrollHeight - 4);
  }, []);

  useEffect(() => {
    updateFades();
    const contentEl = contentRef.current;
    const scrollEl = scrollRef.current;
    // jsdom (and very old webviews) have no ResizeObserver; the fades then
    // stay at whatever the first measurement said instead of crashing.
    if (!contentEl || !scrollEl || typeof ResizeObserver === "undefined") return;
    const observer = new ResizeObserver(updateFades);
    observer.observe(contentEl);
    observer.observe(scrollEl);
    return () => observer.disconnect();
  }, [updateFades]);

  return (
    <div className={cn("relative flex flex-col min-h-0", containerClassName)}>
      {showTop && (
        <div className="pointer-events-none absolute inset-x-0 top-0 h-6 bg-gradient-to-b from-background to-transparent z-10" />
      )}
      <div
        ref={scrollRef}
        onScroll={updateFades}
        className={cn("flex-1 min-h-0 overflow-y-auto", className)}
      >
        <div ref={contentRef}>{children}</div>
      </div>
      {showBottom && (
        <div className="pointer-events-none absolute inset-x-0 bottom-0 h-6 bg-gradient-to-t from-background to-transparent z-10" />
      )}
    </div>
  );
}

interface HorizontalScrollFadeProps {
  children: ReactNode;
  /** Classes for the scrolling strip itself - the strip's existing
   * `flex overflow-x-auto ... hide-scrollbar` classes move here. */
  className?: string;
  /** Classes for the positioning wrapper. */
  containerClassName?: string;
}

/**
 * Left/right counterpart to ScrollFade, for the horizontal metric and card
 * strips that deliberately hide their scrollbar (`.hide-scrollbar`): without
 * a scrollbar and without this, a strip cut off at the viewport edge looks
 * like the full set rather than the start of a longer one.
 *
 * It owns the scroll element itself (rather than wrapping an existing one)
 * so the fades can't drift from what actually scrolls.
 */
export function HorizontalScrollFade({
  children,
  className,
  containerClassName,
}: HorizontalScrollFadeProps) {
  const scrollRef = useRef<HTMLDivElement>(null);
  const [showLeft, setShowLeft] = useState(false);
  const [showRight, setShowRight] = useState(false);

  const updateFades = useCallback(() => {
    const el = scrollRef.current;
    if (!el) return;
    setShowLeft(el.scrollLeft > 4);
    setShowRight(el.scrollLeft + el.clientWidth < el.scrollWidth - 4);
  }, []);

  useEffect(() => {
    updateFades();
    const el = scrollRef.current;
    if (!el || typeof ResizeObserver === "undefined") return;
    const observer = new ResizeObserver(updateFades);
    observer.observe(el);
    for (const child of Array.from(el.children)) observer.observe(child);
    return () => observer.disconnect();
  }, [updateFades, children]);

  return (
    <div className={cn("relative min-w-0", containerClassName)}>
      {showLeft && (
        <div className="pointer-events-none absolute inset-y-0 left-0 w-6 bg-gradient-to-r from-background to-transparent z-10" />
      )}
      <div ref={scrollRef} onScroll={updateFades} className={className}>
        {children}
      </div>
      {showRight && (
        <div className="pointer-events-none absolute inset-y-0 right-0 w-6 bg-gradient-to-l from-background to-transparent z-10" />
      )}
    </div>
  );
}
