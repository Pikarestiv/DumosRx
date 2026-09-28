"use client";

import { useEffect, useState } from "react";

/**
 * Publishes `value` only once it has stopped changing for `delayMs`.
 *
 * Meant for search boxes and anything else whose downstream work (a fuzzy
 * search over the catalog, a re-group of several hundred rows, a query) is far
 * more expensive than the keystroke that triggered it: bind the input to raw
 * state so typing stays instant, and drive the expensive work off the
 * debounced value instead.
 */
export function useDebouncedValue<T>(value: T, delayMs: number): T {
  const [debounced, setDebounced] = useState(value);

  useEffect(() => {
    // Nothing to wait for when the value is already the published one - this
    // also covers a change that gets reverted inside the delay window.
    if (value === debounced) return;

    const timer = setTimeout(() => setDebounced(value), delayMs);
    return () => clearTimeout(timer);
  }, [value, delayMs, debounced]);

  return debounced;
}
