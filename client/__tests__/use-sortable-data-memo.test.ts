import { describe, it, expect } from "vitest";
import { renderHook } from "@testing-library/react";
import { useSortableData } from "@/lib/hooks/use-sortable-data";

type Row = { id: string; name: string; qty: number };

const data: Row[] = [
  { id: "a", name: "Zinc", qty: 3 },
  { id: "b", name: "Amoxil", qty: 1 },
];

/**
 * P5: every call site passes a fresh `accessors` object literal per render,
 * and the hook listed that object in its memo's dependency array — so
 * `[...data].sort()` re-ran on every render of every sortable table in the
 * app. The accessors must not participate in the memo's identity.
 */
describe("useSortableData memoization", () => {
  it("returns the identical sorted array across renders when only the accessors object is new", () => {
    const { result, rerender } = renderHook(
      () =>
        useSortableData<Row, "name">(data, {
          name: (row) => row.name.toLowerCase(),
        }),
    );

    result.current.toggleSort("name");
    rerender();
    const first = result.current.sortedData;
    rerender();

    expect(result.current.sortedData).toBe(first);
  });

  it("still re-sorts when the data or the direction actually changes", () => {
    const { result, rerender } = renderHook(
      ({ rows }: { rows: Row[] }) =>
        useSortableData<Row, "name">(rows, {
          name: (row) => row.name.toLowerCase(),
        }),
      { initialProps: { rows: data } },
    );

    result.current.toggleSort("name");
    rerender({ rows: data });
    expect(result.current.sortedData.map((r) => r.id)).toEqual(["b", "a"]);

    result.current.toggleSort("name");
    rerender({ rows: data });
    expect(result.current.sortedData.map((r) => r.id)).toEqual(["a", "b"]);

    const moreRows = [...data, { id: "c", name: "Brufen", qty: 9 }];
    rerender({ rows: moreRows });
    expect(result.current.sortedData).toHaveLength(3);
  });

  it("uses the accessors from the latest render, not a stale captured copy", () => {
    const { result, rerender } = renderHook(
      ({ invert }: { invert: boolean }) =>
        useSortableData<Row, "qty">(data, {
          qty: (row) => (invert ? -row.qty : row.qty),
        }),
      { initialProps: { invert: false } },
    );

    result.current.toggleSort("qty");
    rerender({ invert: false });
    expect(result.current.sortedData.map((r) => r.id)).toEqual(["b", "a"]);

    // Flipping direction re-runs the comparator: it must use the accessor
    // from the latest render, not one captured when the hook first ran. (A
    // new accessor alone does NOT re-sort — deliberate, since accessors are
    // pure row projections; see the hook's own note.)
    rerender({ invert: true });
    result.current.toggleSort("qty");
    rerender({ invert: true });
    expect(result.current.sortedData.map((r) => r.id)).toEqual(["b", "a"]);
  });
});
