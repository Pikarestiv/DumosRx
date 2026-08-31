import type { ProductImportRow } from "@/lib/utils/product-import-export";

/**
 * Groups row indexes that would collide on import (same dedupe key as
 * importProductRows: name+category, or name alone when no category was
 * mapped). Two rows in the same group would both match the same existing/new
 * product, silently merging what may be two distinct products — the caller
 * surfaces this as a pre-flight warning instead of writing it silently.
 */
export function findInFileDuplicates(rows: ProductImportRow[]): number[][] {
  const groups = new Map<string, number[]>();
  rows.forEach((row, index) => {
    const key = `${row.name.trim().toLowerCase()}::${(row.category || "").trim().toLowerCase()}`;
    const group = groups.get(key);
    if (group) {
      group.push(index);
    } else {
      groups.set(key, [index]);
    }
  });
  return [...groups.values()].filter((group) => group.length > 1);
}
