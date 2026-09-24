"use client";

import { useEffect, useRef, useState } from "react";

const PULL_THRESHOLD = 64;
const MAX_PULL = 96;
const RESISTANCE = 0.5;
// Vertical travel required before a touch is treated as a pull rather than a
// tap. Without this, a normal tap's 1-3px of finger jitter got claimed as a
// pull and preventDefault()'d on the first pointermove - which cancels
// WebKit's tap-to-click synthesis and silently drops the tap (iPad: buttons
// and tabs at the top of a scroll area intermittently doing nothing).
const PULL_SLOP = 12;

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
  const startX = useRef<number | null>(null);
  const pulling = useRef(false);
  const engaged = useRef(false);
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
      startX.current = e.clientX;
      pulling.current = true;
      engaged.current = false;
    };

    const handlePointerMove = (e: PointerEvent) => {
      if (!pulling.current || startY.current === null || startX.current === null) return;
      const diff = e.clientY - startY.current;
      const diffX = e.clientX - startX.current;
      if (diff <= 0 || el.scrollTop > 0) {
        pulling.current = false;
        if (engaged.current) setPull(0);
        engaged.current = false;
        return;
      }
      // Below PULL_SLOP, diff and diffX are both still jitter-scale, so a
      // horizontal-intent comparison here is unreliable: a real straight-down
      // pull's very first frame can easily read e.g. diff=1, diffX=2 purely
      // from finger noise, which would wrongly and PERMANENTLY cancel the
      // whole gesture (pulling.current stays false for every later frame,
      // even once the pull becomes unambiguous). Wait for enough vertical
      // travel to make the comparison meaningful, and until then don't
      // preventDefault (cancels tap-to-click synthesis) or setState (a root
      // re-render between touchstart and click drops the tap too) - this may
      // still turn out to be a tap.
      if (diff < PULL_SLOP) return;
      if (Math.abs(diffX) > diff) {
        // Now that there's real vertical travel to compare against, a
        // horizontal component that still dominates it means this is a
        // sideways gesture, not a pull - stop watching it for the rest of
        // this touch (no snapping back and forth between the two).
        pulling.current = false;
        return;
      }
      engaged.current = true;
      e.preventDefault();
      setPull(Math.min((diff - PULL_SLOP) * RESISTANCE, MAX_PULL));
    };

    const handlePointerUp = async () => {
      if (!pulling.current) return;
      pulling.current = false;
      startY.current = null;
      startX.current = null;
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

    const onPointerUp = () => void handlePointerUp();

    el.addEventListener("pointerdown", handlePointerDown);
    el.addEventListener("pointermove", handlePointerMove, { passive: false });
    el.addEventListener("pointerup", onPointerUp);
    el.addEventListener("pointercancel", onPointerUp);

    return () => {
      el.removeEventListener("pointerdown", handlePointerDown);
      el.removeEventListener("pointermove", handlePointerMove);
      el.removeEventListener("pointerup", onPointerUp);
      el.removeEventListener("pointercancel", onPointerUp);
    };
  }, [disabled]);

  return { scrollRef, pullDistance, isRefreshing, threshold: PULL_THRESHOLD };
}
