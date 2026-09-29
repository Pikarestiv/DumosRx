import { useMemo, useRef, useState } from "react";

export type SortDirection = "asc" | "desc";

/** Generic column-sort state + comparator, meant to be shared across every
 * sortable table in the app (product catalog, and any "other relevant
 * tables" added later) rather than reimplemented per table. `accessors`
 * maps a column key to a function pulling the comparable value off a row;
 * strings sort via localeCompare, numbers via subtraction.
 *
 * `accessors` is read through a ref, so passing a fresh object literal (what
 * every call site does) doesn't invalidate the sort memo. The trade-off: a
 * changed accessor alone doesn't re-sort — they're expected to be pure
 * projections of a row, not to depend on outside state. */
export function useSortableData<T, K extends string>(
  data: T[],
  accessors: Record<K, (item: T) => string | number>,
) {
  const [sortKey, setSortKey] = useState<K | null>(null);
  const [direction, setDirection] = useState<SortDirection>("asc");

  const toggleSort = (key: K) => {
    if (sortKey === key) {
      setDirection((d) => (d === "asc" ? "desc" : "asc"));
    } else {
      setSortKey(key);
      setDirection("asc");
    }
  };

  // Held in a ref instead of the memo's dependency array: every call site
  // passes a fresh object literal per render, which defeated the memo
  // everywhere and re-sorted the whole table on every keystroke.
  const accessorsRef = useRef(accessors);
  accessorsRef.current = accessors;

  const sortedData = useMemo(() => {
    if (!sortKey) return data;
    const accessor = accessorsRef.current[sortKey];
    const sign = direction === "asc" ? 1 : -1;
    return [...data].sort((a, b) => {
      const av = accessor(a);
      const bv = accessor(b);
      const cmp =
        typeof av === "string" && typeof bv === "string"
          ? av.localeCompare(bv)
          : (av as number) - (bv as number);
      return cmp * sign;
    });
  }, [data, sortKey, direction]);

  return { sortKey, direction, toggleSort, sortedData };
}
