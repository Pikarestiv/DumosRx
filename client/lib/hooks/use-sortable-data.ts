import { useMemo, useRef, useState } from "react";

export type SortDirection = "asc" | "desc";

// Generic column-sort state + comparator, meant to be shared across every sortable table in the app (product catalog, and any "other relevant…
// Rationale: docs/CLIENT_LIB_COMMENTS.md#hooks-use-sortable-data-L5
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

  // Held in a ref instead of the memo's dependency array:
  // Rationale: docs/CLIENT_LIB_COMMENTS.md#line-hooks-use-sortable-data-ts-L23
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
