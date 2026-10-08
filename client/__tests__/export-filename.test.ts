import { describe, it, expect } from "vitest";
import { buildExportFilename } from "@/lib/utils/export-filename";

/**
 * A date-only export name silently overwrote the earlier file when two
 * exports happened on the same day, and gave no way to tell two stores'
 * exports apart in a Downloads folder. Hit for real on 2026-10-08.
 */
const AT = new Date(2026, 9, 8, 19, 28);

describe("buildExportFilename", () => {
  it("includes store, kind, date and time", () => {
    expect(
      buildExportFilename({ kind: "Products", extension: "csv", storeName: "Nest Pharmacy A2", at: AT }),
    ).toBe("DumosRx_Nest-Pharmacy-A2_Products_2026-10-08_1928.csv");
  });

  it("does not collide for two exports in the same day", () => {
    const a = buildExportFilename({ kind: "Products", extension: "csv", storeName: "S", at: new Date(2026, 9, 8, 9, 5) });
    const b = buildExportFilename({ kind: "Products", extension: "csv", storeName: "S", at: new Date(2026, 9, 8, 19, 28) });
    expect(a).not.toBe(b);
  });

  it("does not collide for two stores at the same moment", () => {
    const a = buildExportFilename({ kind: "Products", extension: "csv", storeName: "Store A", at: AT });
    const b = buildExportFilename({ kind: "Products", extension: "csv", storeName: "Store B", at: AT });
    expect(a).not.toBe(b);
  });

  it("strips characters a filesystem would choke on", () => {
    const name = buildExportFilename({ kind: "Products", extension: "csv", storeName: 'A/B:C*?"<>|D', at: AT });
    expect(name).not.toMatch(/[/\\:*?"<>|]/);
  });

  it("falls back when the store has no name", () => {
    expect(buildExportFilename({ kind: "Products", extension: "csv", storeName: null, at: AT })).toContain("_Store_");
  });
});
