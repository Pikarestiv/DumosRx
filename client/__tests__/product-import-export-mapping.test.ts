import { describe, it, expect } from "vitest";
import { detectColumnMapping } from "@/lib/utils/product-import-export";

describe("detectColumnMapping", () => {
  it("maps the first QuickBooks export's headers (Item Number, Item Name, Average Unit Cost, Regular Price, Department Name, Qty 1)", () => {
    const headers = [
      "Item Number",
      "Item Name",
      "Average Unit Cost",
      "Regular Price",
      "Department Name",
      "Qty 1",
    ];
    expect(detectColumnMapping(headers)).toEqual({
      "Item Number": "barcode",
      "Item Name": "name",
      "Average Unit Cost": "cost_price",
      "Regular Price": "selling_price",
      "Department Name": "category",
      "Qty 1": "quantity",
    });
  });

  it("maps the second QuickBooks export's headers, including Vendor Name and Reorder Point 1", () => {
    const headers = [
      "Item Number",
      "Item Name",
      "Average Unit Cost",
      "Regular Price",
      "Item Type",
      "Department Name",
      "Department Code",
      "Vendor Name",
      "Qty 1",
      "Reorder Point 1",
    ];
    const mapping = detectColumnMapping(headers);
    expect(mapping["Vendor Name"]).toBe("supplier");
    expect(mapping["Reorder Point 1"]).toBe("reorder_level");
    expect(mapping["Item Type"]).toBe("ignore");
    expect(mapping["Department Code"]).toBe("ignore");
  });

  it("maps the Moniebook CSV headers, taking only the first per-branch Stock/Available column", () => {
    const headers = [
      "SKU",
      "Item Name",
      "Category",
      "Cost Price",
      "Fixed Sell Price",
      "Supplier",
      "Barcode",
      "Available [Main branch]",
      "Stock [Main branch]",
      "Available [Enugu agidi 2]",
      "Stock [Enugu agidi 2]",
    ];
    const mapping = detectColumnMapping(headers);
    expect(mapping).toMatchObject({
      SKU: "barcode",
      "Item Name": "name",
      Category: "category",
      "Cost Price": "cost_price",
      "Fixed Sell Price": "selling_price",
      Supplier: "supplier",
      Barcode: "ignore", // SKU already claimed "barcode"; first match wins
      "Available [Main branch]": "quantity",
      "Stock [Main branch]": "ignore", // "quantity" already claimed
      "Available [Enugu agidi 2]": "ignore",
      "Stock [Enugu agidi 2]": "ignore",
    });
  });

  it("marks an unrecognized column as ignore instead of guessing", () => {
    const mapping = detectColumnMapping(["Some Custom Field"]);
    expect(mapping["Some Custom Field"]).toBe("ignore");
  });
});
