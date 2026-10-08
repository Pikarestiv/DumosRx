import { describe, it, expect } from "vitest";
import {
  EXPORT_COLUMNS,
  detectColumnMapping,
  type ProductField,
} from "@/lib/utils/product-import-export";

/**
 * The app's own export must be re-importable. It wasn't: the exporter writes
 * "Stock Quantity" and HEADER_ALIASES knew "quantity", "qty" and "stock" but
 * not that phrase — so re-importing a DumosRx export silently mapped the
 * column to "ignore" and every product landed at 0 stock, taking cost price
 * with it (cost lives on stock_batches, which is only created when a
 * quantity is present). Hit for real on 2026-10-08.
 *
 * This pins the whole round trip rather than the one label, so adding an
 * export column without an alias fails here instead of in a store.
 */
const EXPECTED_FIELD: Record<string, ProductField> = {
  name: "name",
  category: "category",
  supplier: "supplier",
  barcode: "barcode",
  costPrice: "cost_price",
  sellingPrice: "selling_price",
  quantity: "quantity",
  reorderLevel: "reorder_level",
  showOnline: "show_online",
};

describe("a DumosRx export can be re-imported", () => {
  const headers = EXPORT_COLUMNS.map((column) => column.label);
  const mapping = detectColumnMapping(headers);

  it("maps every exported column to a real field, never to ignore", () => {
    const ignored = headers.filter((header) => mapping[header] === "ignore");
    expect(ignored).toEqual([]);
  });

  it.each(EXPORT_COLUMNS)("maps $label back to the field it came from", (column) => {
    expect(mapping[column.label]).toBe(EXPECTED_FIELD[column.key]);
  });

  it("carries stock quantity specifically, the column that was dropped", () => {
    expect(mapping["Stock Quantity"]).toBe("quantity");
  });

  it("still maps the QuickBooks and Moniebook spellings it already supported", () => {
    expect(detectColumnMapping(["Qty 1"])["Qty 1"]).toBe("quantity");
    expect(detectColumnMapping(["Available"])["Available"]).toBe("quantity");
    expect(detectColumnMapping(["Stock [Main branch]"])["Stock [Main branch]"]).toBe("quantity");
  });

  it("claims only the first column for a repeatable field", () => {
    const withDuplicates = detectColumnMapping(["Stock Quantity", "Qty"]);
    expect(withDuplicates["Stock Quantity"]).toBe("quantity");
    expect(withDuplicates["Qty"]).toBe("ignore");
  });
});
