import { describe, it, expect, beforeEach } from "vitest";
import {
  getStoredExportColumns,
  setStoredExportColumns,
} from "@/components/stock-batch/export-columns-dialog";

describe("export column selection persistence", () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it("returns null when nothing has been stored yet", () => {
    expect(getStoredExportColumns()).toBeNull();
  });

  it("round-trips a stored selection", () => {
    setStoredExportColumns(["name", "sellingPrice"]);
    expect(getStoredExportColumns()).toEqual(["name", "sellingPrice"]);
  });
});
