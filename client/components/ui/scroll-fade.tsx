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
  // content wrapper instead — that's what actually reflects scrollHeight.
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
    if (!contentEl || !scrollEl) return;
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
