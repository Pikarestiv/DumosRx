import { describe, it, expect } from "vitest";
import {
  parseNumericValue,
  mapRowToProduct,
  detectColumnMapping,
} from "@/lib/utils/product-import-export";

describe("parseNumericValue", () => {
  it("parses plain numbers", () => {
    expect(parseNumericValue(1500)).toBe(1500);
    expect(parseNumericValue("1500")).toBe(1500);
  });

  it("strips currency symbols and thousands separators", () => {
    expect(parseNumericValue("₦1,500.00")).toBe(1500);
    expect(parseNumericValue("1,500")).toBe(1500);
  });

  it("returns undefined for blank or non-numeric input", () => {
    expect(parseNumericValue("")).toBeUndefined();
    expect(parseNumericValue(undefined)).toBeUndefined();
    expect(parseNumericValue("N/A")).toBeUndefined();
  });
});

describe("mapRowToProduct", () => {
  const headers = [
    "Item Number",
    "Item Name",
    "Average Unit Cost",
    "Regular Price",
    "Department Name",
    "Qty 1",
  ];
  const mapping = detectColumnMapping(headers);

  it("maps a real QuickBooks row into a ProductImportRow", () => {
    const row = {
      "Item Number": 114,
      "Item Name": "CYPRI GOLD SMALL SYRUP",
      "Average Unit Cost": 249.91497,
      "Regular Price": 1000,
      "Department Name": "DRUGS",
      "Qty 1": 3,
    };
    expect(mapRowToProduct(row, mapping)).toEqual({
      name: "CYPRI GOLD SMALL SYRUP",
      barcode: "114",
      costPrice: 249.91497,
      sellingPrice: 1000,
      category: "DRUGS",
      quantity: 3,
    });
  });

  it("returns null when the name is blank, so the caller can skip the row", () => {
    const row = { "Item Number": 999, "Item Name": "", "Qty 1": 5 };
    expect(mapRowToProduct(row, mapping)).toBeNull();
  });
});
