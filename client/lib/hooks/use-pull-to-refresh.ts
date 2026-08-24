"use client";

import { useEffect, useRef, useState } from "react";

const PULL_THRESHOLD = 64;
const MAX_PULL = 96;
const RESISTANCE = 0.5;

interface UsePullToRefreshOptions {
  onRefresh: () => Promise<void> | void;
  disabled?: boolean;
}

/**
 * Gated to pointerType === "touch": this is the mobile-only signal we want
 * (unlike viewport-width checks, it also correctly fires under Chrome's
 * mobile device emulation and ignores mouse/trackpad drags on desktop).
 */
export function usePullToRefresh<T extends HTMLElement>({
  onRefresh,
  disabled,
}: UsePullToRefreshOptions) {
  const scrollRef = useRef<T>(null);
  const [pullDistance, setPullDistance] = useState(0);
  const [isRefreshing, setIsRefreshing] = useState(false);

  const startY = useRef<number | null>(null);
  const pulling = useRef(false);
  const currentPull = useRef(0);
  const onRefreshRef = useRef(onRefresh);
  onRefreshRef.current = onRefresh;

  useEffect(() => {
    const el = scrollRef.current;
    if (!el || disabled) return;

    const setPull = (v: number) => {
      currentPull.current = v;
      setPullDistance(v);
    };

    const handlePointerDown = (e: PointerEvent) => {
      if (e.pointerType !== "touch") return;
      if (el.scrollTop > 0) return;
      startY.current = e.clientY;
      pulling.current = true;
    };

    const handlePointerMove = (e: PointerEvent) => {
      if (!pulling.current || startY.current === null) return;
      const diff = e.clientY - startY.current;
      if (diff <= 0 || el.scrollTop > 0) {
        pulling.current = false;
        setPull(0);
        return;
      }
      e.preventDefault();
      setPull(Math.min(diff * RESISTANCE, MAX_PULL));
    };

    const handlePointerUp = async () => {
      if (!pulling.current) return;
      pulling.current = false;
      startY.current = null;
      if (currentPull.current >= PULL_THRESHOLD) {
        setIsRefreshing(true);
        setPull(PULL_THRESHOLD);
        try {
          await onRefreshRef.current();
        } finally {
          setIsRefreshing(false);
          setPull(0);
        }
      } else {
        setPull(0);
      }
    };

    el.addEventListener("pointerdown", handlePointerDown);
    el.addEventListener("pointermove", handlePointerMove, { passive: false });
    el.addEventListener("pointerup", handlePointerUp);
    el.addEventListener("pointercancel", handlePointerUp);

    return () => {
      el.removeEventListener("pointerdown", handlePointerDown);
      el.removeEventListener("pointermove", handlePointerMove);
      el.removeEventListener("pointerup", handlePointerUp);
      el.removeEventListener("pointercancel", handlePointerUp);
    };
  }, [disabled]);

  return { scrollRef, pullDistance, isRefreshing, threshold: PULL_THRESHOLD };
}
