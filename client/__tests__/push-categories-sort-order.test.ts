import { describe, it, expect } from "vitest";
import { compareCategoriesFirst } from "@/lib/db/sync-engine/push";

/**
 * Regression: the previous comparator
 * `(a, b) => (a.table_name === "categories" ? -1 : b.table_name === "categories" ? 1 : 0)`
 * returned -1 for BOTH `compare(a, b)` and `compare(b, a)` whenever a and b
 * were both categories - an inconsistent comparator, which V8's sort doesn't
 * guarantee any particular result for beyond "some order", and in practice
 * reversed the created_at order of every category-vs-category pair. A
 * create-then-rename pair queued as [INSERT, UPDATE] was pushed to the
 * server as [UPDATE, INSERT], so the server applied the stale INSERT last
 * and the rename was silently lost on the next pull.
 */
describe("compareCategoriesFirst", () => {
  it("moves every category ahead of every non-category row", () => {
    const rows = [
      { table_name: "sales", id: 1 },
      { table_name: "categories", id: 2 },
      { table_name: "sale_items", id: 3 },
      { table_name: "categories", id: 4 },
    ];
    rows.sort(compareCategoriesFirst);
    expect(rows.map((r) => r.table_name)).toEqual([
      "categories",
      "categories",
      "sales",
      "sale_items",
    ]);
  });

  it("preserves created_at order among multiple categories instead of reversing it", () => {
    // A create (id 1) followed by a rename (id 2) of the same category,
    // queued in that chronological order.
    const rows = [
      { table_name: "categories", id: 1, op: "INSERT" },
      { table_name: "categories", id: 2, op: "UPDATE" },
    ];
    rows.sort(compareCategoriesFirst);
    expect(rows.map((r) => r.op)).toEqual(["INSERT", "UPDATE"]);
  });

  it("preserves order among non-category rows", () => {
    const rows = [
      { table_name: "sales", id: 1 },
      { table_name: "sale_items", id: 2 },
      { table_name: "expenses", id: 3 },
    ];
    rows.sort(compareCategoriesFirst);
    expect(rows.map((r) => r.id)).toEqual([1, 2, 3]);
  });

  it("is a consistent comparator: compare(a,b) and compare(b,a) are opposite signs, never both negative", () => {
    const category = { table_name: "categories" };
    const other = { table_name: "categories" };
    const ab = compareCategoriesFirst(category, other);
    const ba = compareCategoriesFirst(other, category);
    expect(ab).toBe(0);
    expect(ba).toBe(0);
  });
});
