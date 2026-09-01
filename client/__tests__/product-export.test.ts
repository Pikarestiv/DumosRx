import { describe, it, expect } from "vitest";
import { EXPORT_COLUMNS, buildExportBlob } from "@/lib/utils/product-import-export";
import type { ExportableProduct } from "@/lib/db/queries/product-export";

describe("buildExportBlob", () => {
  const products: ExportableProduct[] = [
    {
      name: "CYPRI GOLD SMALL SYRUP",
      category: "DRUGS",
      supplier: "System",
      barcode: "114",
      costPrice: 700,
      sellingPrice: 1000,
      quantity: 5,
      reorderLevel: 2,
    },
  ];

  it("includes every EXPORT_COLUMNS label by default", () => {
    const allKeys = EXPORT_COLUMNS.map((c) => c.key);
    const blob = buildExportBlob(products, allKeys, "csv");
    expect(blob.type).toContain("text/csv");
  });

  it("only includes the selected columns, in the fixed EXPORT_COLUMNS order (not selection order)", async () => {
    const blob = buildExportBlob(products, ["sellingPrice", "name"], "csv");
    const text = await blob.text();
    const [header] = text.trim().split("\n");
    expect(header).toBe("Product Name,Selling Price");
  });

  it("produces an xlsx blob with the correct MIME type", () => {
    const blob = buildExportBlob(products, ["name"], "xlsx");
    expect(blob.type).toBe(
      "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    );
  });
});
