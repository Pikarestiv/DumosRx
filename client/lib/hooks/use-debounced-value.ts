"use client";

import { useEffect, useState } from "react";

// Publishes `value` only once it has stopped changing for `delayMs`.
// Rationale: docs/CLIENT_LIB_COMMENTS.md#hooks-use-debounced-value-ts-L5
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
