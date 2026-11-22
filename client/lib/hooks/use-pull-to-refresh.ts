"use client";

import { useEffect, useRef, useState } from "react";
import { triggerHapticFeedback } from "@/lib/utils/haptics";

const PULL_THRESHOLD = 64;
const MAX_PULL = 96;
const RESISTANCE = 0.5;
const PULL_SLOP = 10;

interface UsePullToRefreshOptions {
  onRefresh: () => Promise<void> | void;
  disabled?: boolean;
}

function isScrolledToTop(target: EventTarget | null, root: HTMLElement): boolean {
  if (root.scrollTop > 0) return false;
  let node = target instanceof HTMLElement ? target : null;
  while (node && node !== root) {
    if (node.scrollTop > 0) return false;
    node = node.parentElement;
  }
  return true;
}

export function usePullToRefresh<T extends HTMLElement>({
  onRefresh,
  disabled,
}: UsePullToRefreshOptions) {
  const scrollRef = useRef<T>(null);
  const [pullDistance, setPullDistance] = useState(0);
  const [isRefreshing, setIsRefreshing] = useState(false);

  const startY = useRef<number | null>(null);
  const startX = useRef<number | null>(null);
  const pulling = useRef(false);
  const engaged = useRef(false);
  const thresholdReached = useRef(false);
  const currentPull = useRef(0);
  const onRefreshRef = useRef(onRefresh);

  useEffect(() => {
    onRefreshRef.current = onRefresh;
  }, [onRefresh]);

  useEffect(() => {
    const el = scrollRef.current;
    if (!el || disabled) return;

    const setPull = (v: number) => {
      currentPull.current = v;
      setPullDistance(v);
    };

    const handleTouchStart = (e: TouchEvent) => {
      if (e.touches.length !== 1) return;
      if (!isScrolledToTop(e.target, el)) return;
      startY.current = e.touches[0].clientY;
      startX.current = e.touches[0].clientX;
      pulling.current = true;
      engaged.current = false;
      thresholdReached.current = false;
    };

    const handleTouchMove = (e: TouchEvent) => {
      if (!pulling.current || startY.current === null || startX.current === null) return;
      if (e.touches.length !== 1) {
        pulling.current = false;
        if (engaged.current) setPull(0);
        engaged.current = false;
        return;
      }

      const diff = e.touches[0].clientY - startY.current;
      const diffX = e.touches[0].clientX - startX.current;

      if (diff <= 0 || !isScrolledToTop(e.target, el)) {
        pulling.current = false;
        if (engaged.current) setPull(0);
        engaged.current = false;
        return;
      }

      if (Math.abs(diffX) > diff && diff >= PULL_SLOP) {
        pulling.current = false;
        if (engaged.current) setPull(0);
        engaged.current = false;
        return;
      }

      if (diff < PULL_SLOP) return;

      engaged.current = true;
      if (e.cancelable) e.preventDefault();
      const nextPull = Math.min((diff - PULL_SLOP) * RESISTANCE, MAX_PULL);
      if (nextPull >= PULL_THRESHOLD && !thresholdReached.current) {
        thresholdReached.current = true;
        triggerHapticFeedback(12);
      } else if (nextPull < PULL_THRESHOLD) {
        thresholdReached.current = false;
      }
      setPull(nextPull);
    };

    const handleTouchEnd = async () => {
      if (!pulling.current) return;
      pulling.current = false;
      startY.current = null;
      startX.current = null;
      thresholdReached.current = false;
      if (!engaged.current) return;
      engaged.current = false;
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

    const onTouchEnd = () => void handleTouchEnd();

    el.addEventListener("touchstart", handleTouchStart, { passive: true });
    el.addEventListener("touchmove", handleTouchMove, { passive: false });
    el.addEventListener("touchend", onTouchEnd, { passive: true });
    el.addEventListener("touchcancel", onTouchEnd, { passive: true });

    return () => {
      el.removeEventListener("touchstart", handleTouchStart);
      el.removeEventListener("touchmove", handleTouchMove);
      el.removeEventListener("touchend", onTouchEnd);
      el.removeEventListener("touchcancel", onTouchEnd);
    };
  }, [disabled]);

  return { scrollRef, pullDistance, isRefreshing, threshold: PULL_THRESHOLD };
}
