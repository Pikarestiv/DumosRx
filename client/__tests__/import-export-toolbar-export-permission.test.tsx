import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";

/**
 * "export_product_list" fronts the catalog's Export dropdown - taking a
 * copy of the whole product list (cost columns included) off the device.
 * Import is a different right and stays under manage_products, so the
 * toolbar keeps a working control rather than emptying out.
 */

const hasPermission = vi.fn((_key: string) => true);

vi.mock("@/lib/hooks/use-permissions", () => ({
  useHasPermission: (key: string) => hasPermission(key),
}));
vi.mock("@/lib/context/store-context", () => ({
  useStore: () => ({ storeProfile: { name: "Dumos" } }),
}));
vi.mock("@/components/stock-batch/import-mapping-dialog", () => ({
  ImportMappingDialog: () => null,
}));
vi.mock("@/components/stock-batch/export-columns-dialog", () => ({
  ExportColumnsDialog: () => null,
}));

import { ImportExportToolbar } from "@/components/stock-batch/import-export-toolbar";

function renderToolbar() {
  render(<ImportExportToolbar onImported={vi.fn()} />);
}

describe("Catalog import/export toolbar export permission", () => {
  beforeEach(() => {
    hasPermission.mockReset();
    hasPermission.mockImplementation(() => true);
  });

  it("checks the export_product_list key", () => {
    renderToolbar();
    expect(hasPermission).toHaveBeenCalledWith("export_product_list");
  });

  it("offers Export with export_product_list", () => {
    renderToolbar();
    expect(screen.queryByText("Export")).not.toBeNull();
  });

  it("hides Export without export_product_list but keeps Import", () => {
    hasPermission.mockImplementation(
      (key: string) => key !== "export_product_list",
    );
    renderToolbar();
    expect(screen.queryByText("Export")).toBeNull();
    expect(screen.queryByText("Import")).not.toBeNull();
  });
});
