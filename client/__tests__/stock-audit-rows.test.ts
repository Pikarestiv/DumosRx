import { describe, it, expect } from "vitest";
import { buildStockAuditRows } from "@/lib/utils/product-import-export";

describe("buildStockAuditRows", () => {
  it("numbers # from 1 within the set it is given", () => {
    const { rows } = buildStockAuditRows([
      { name: "Flagyl", category: "Antibiotics", quantity: 4 },
      { name: "Amoxil", category: "Antibiotics", quantity: 9 },
    ]);
    expect(rows.map((r) => [r["#"], r.Product])).toEqual([
      [1, "Flagyl"],
      [2, "Amoxil"],
    ]);
  });

  it("fills Counted Qty when a count was entered and leaves it blank otherwise", () => {
    const { rows } = buildStockAuditRows([
      { name: "Amoxil", category: "Antibiotics", quantity: 9, countedQty: 7 },
      { name: "Zero", category: "Antibiotics", quantity: 2, countedQty: 0 },
      { name: "Flagyl", category: "Antibiotics", quantity: 4 },
    ]);
    expect(rows.map((r) => r["Counted Qty"])).toEqual([7, 0, ""]);
  });
});
