import { useMemo, useState } from "react";

export type SortDirection = "asc" | "desc";

/** Generic column-sort state + comparator, meant to be shared across every
 * sortable table in the app (product catalog, and any "other relevant
 * tables" added later) rather than reimplemented per table. `accessors`
 * maps a column key to a function pulling the comparable value off a row;
 * strings sort via localeCompare, numbers via subtraction. */
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

  const sortedData = useMemo(() => {
    if (!sortKey) return data;
    const accessor = accessors[sortKey];
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
  }, [data, sortKey, direction, accessors]);

  return { sortKey, direction, toggleSort, sortedData };
}
