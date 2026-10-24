import { useMemo, useState } from "react";

export type SortDirection = "asc" | "desc";

// Generic column-sort state + comparator, meant to be shared across every sortable table in the app (product catalog, and any "other relevant…
// Rationale: docs/CLIENT_LIB_COMMENTS.md#hooks-use-sortable-data-L5
export function useSortableData<T, K extends string>(
  data: T[],
  accessors: Record<K, (item: T) => string | number>,
) {
  const [sort, setSort] = useState<{
    key: K;
    accessor: (item: T) => string | number;
  } | null>(null);
  const [direction, setDirection] = useState<SortDirection>("asc");
  const sortKey = sort?.key ?? null;
  const sortAccessor = sort?.accessor;

  const toggleSort = (key: K) => {
    setSort({ key, accessor: accessors[key] });
    if (sortKey === key) {
      setDirection((d) => (d === "asc" ? "desc" : "asc"));
    } else {
      setDirection("asc");
    }
  };

  const sortedData = useMemo(
    () => (sortAccessor ? sortByAccessor(data, sortAccessor, direction) : data),
    [data, sortAccessor, direction],
  );

  return { sortKey, direction, toggleSort, sortedData };
}

export function sortByAccessor<T>(
  data: T[],
  accessor: (item: T) => string | number,
  direction: SortDirection,
): T[] {
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
}
