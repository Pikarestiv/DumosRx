import { describe, it, expect } from "vitest";
import { findInFileDuplicates } from "@/lib/db/queries/product-import";
import type { ProductImportRow } from "@/lib/utils/product-import-export";

describe("findInFileDuplicates", () => {
  it("flags two rows with the same name and category", () => {
    const rows: ProductImportRow[] = [
      { name: "PARACETAMOL", category: "DRUGS" },
      { name: "paracetamol", category: "drugs" }, // case-insensitive match
      { name: "IBUPROFEN", category: "DRUGS" },
    ];
    expect(findInFileDuplicates(rows)).toEqual([[0, 1]]);
  });

  it("does not flag the same name in different categories", () => {
    const rows: ProductImportRow[] = [
      { name: "PARACETAMOL", category: "DRUGS" },
      { name: "PARACETAMOL", category: "OTC" },
    ];
    expect(findInFileDuplicates(rows)).toEqual([]);
  });

  it("flags same-name rows when no category was mapped at all", () => {
    const rows: ProductImportRow[] = [
      { name: "PARACETAMOL" },
      { name: "PARACETAMOL" },
    ];
    expect(findInFileDuplicates(rows)).toEqual([[0, 1]]);
  });
});
