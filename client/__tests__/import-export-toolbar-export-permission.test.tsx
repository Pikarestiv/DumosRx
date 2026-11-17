import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";

// "export_product_list" fronts the catalog's Export dropdown - taking a copy of the whole product list (cost columns inclu…
// Rationale: docs/CLIENT_COMMENTS.md#block-__tests__-import-export-toolbar-export-permission-test-tsx-L4

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

import { DropdownMenu, DropdownMenuContent } from "@/components/ui/dropdown-menu";
import { useImportExportActions } from "@/components/stock-batch/import-export-actions";

function Harness() {
  const { menuItems, overlays } = useImportExportActions({ onImported: vi.fn() });
  return (
    <>
      <DropdownMenu open>
        <DropdownMenuContent>{menuItems}</DropdownMenuContent>
      </DropdownMenu>
      {overlays}
    </>
  );
}

function renderToolbar() {
  render(<Harness />);
}

describe("Catalog import/export actions export permission", () => {
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
    expect(screen.queryByText("Export product list")).not.toBeNull();
  });

  it("hides Export without export_product_list but keeps Import", () => {
    hasPermission.mockImplementation(
      (key: string) => key !== "export_product_list",
    );
    renderToolbar();
    expect(screen.queryByText("Export product list")).toBeNull();
    expect(screen.queryByText("Import products from a file")).not.toBeNull();
  });
});
