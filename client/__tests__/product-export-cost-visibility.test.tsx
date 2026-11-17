import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import {
  getExportColumns,
  buildExportRows,
  buildExportBlob,
} from "@/lib/utils/product-import-export";
import type { ExportableProduct } from "@/lib/db/queries/product-export";
import { ExportColumnsDialog } from "@/components/stock-batch/export-columns-dialog";

const granted = new Set<string>();

vi.mock("@/lib/hooks/use-permissions", () => ({
  useHasPermission: (key: string) => granted.has(key),
}));

describe("Product export cost visibility (A-382)", () => {
  beforeEach(() => {
    granted.clear();
    localStorage.clear();
  });

  const products: ExportableProduct[] = [
    {
      name: "Amoxicillin 500mg",
      category: "Antibiotics",
      supplier: "Fidson",
      barcode: "12345",
      costPrice: 450,
      sellingPrice: 700,
      quantity: 50,
      reorderLevel: 10,
      showOnline: "Yes",
    },
  ];

  describe("getExportColumns and buildExportRows/Blob", () => {
    it("excludes costPrice from getExportColumns when canViewCost is false", () => {
      const columns = getExportColumns(false);
      expect(columns.find((c) => c.key === "costPrice")).toBeUndefined();
      expect(columns.find((c) => c.key === "sellingPrice")).toBeDefined();
    });

    it("includes costPrice in getExportColumns when canViewCost is true", () => {
      const columns = getExportColumns(true);
      expect(columns.find((c) => c.key === "costPrice")).toBeDefined();
    });

    it("strips costPrice from exported rows when canViewCost is false, even if requested", () => {
      const { headers, rows } = buildExportRows(
        products,
        ["name", "costPrice", "sellingPrice"],
        false,
      );

      expect(headers).not.toContain("Cost Price");
      expect(headers).toContain("Product Name");
      expect(headers).toContain("Selling Price");
      expect(rows[0]["Cost Price"]).toBeUndefined();
      expect(rows[0]["Selling Price"]).toBe(700);
    });

    it("strips costPrice from CSV blob when canViewCost is false", async () => {
      const blob = await buildExportBlob(
        products,
        ["name", "costPrice", "sellingPrice"],
        "csv",
        false,
      );
      const text = await blob.text();
      expect(text).not.toContain("Cost Price");
      expect(text).not.toContain("450");
      expect(text).toContain("700");
    });

    it("includes costPrice in CSV blob when canViewCost is true", async () => {
      const blob = await buildExportBlob(
        products,
        ["name", "costPrice", "sellingPrice"],
        "csv",
        true,
      );
      const text = await blob.text();
      expect(text).toContain("Cost Price");
      expect(text).toContain("450");
    });
  });

  describe("ExportColumnsDialog", () => {
    it("hides Cost Price checkbox when view_cost_fields is withheld", () => {
      render(
        <ExportColumnsDialog
          open={true}
          onOpenChange={vi.fn()}
          onConfirm={vi.fn()}
        />,
      );

      expect(screen.queryByLabelText("Cost Price")).toBeNull();
      expect(screen.getByLabelText("Product Name")).toBeTruthy();
      expect(screen.getByLabelText("Selling Price")).toBeTruthy();
    });

    it("does not export costPrice when confirmed without view_cost_fields", () => {
      const onConfirm = vi.fn();
      render(
        <ExportColumnsDialog
          open={true}
          onOpenChange={vi.fn()}
          onConfirm={onConfirm}
        />,
      );

      fireEvent.click(screen.getByRole("button", { name: "Export" }));
      expect(onConfirm).toHaveBeenCalled();
      const exportedKeys = onConfirm.mock.calls[0][0];
      expect(exportedKeys).not.toContain("costPrice");
    });

    it("shows Cost Price checkbox when view_cost_fields is granted", () => {
      granted.add("view_cost_fields");
      render(
        <ExportColumnsDialog
          open={true}
          onOpenChange={vi.fn()}
          onConfirm={vi.fn()}
        />,
      );

      expect(screen.getByLabelText("Cost Price")).toBeTruthy();
    });
  });
});
