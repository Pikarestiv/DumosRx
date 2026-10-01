import { describe, it, expect, vi, beforeEach } from "vitest";
import { buildGlobalProductMetricsCsv } from "@/lib/admin-metrics-export";
import { downloadStoreFleetCsv } from "@/lib/admin-store-export";
import { downloadUserDirectoryCsv } from "@/lib/admin-user-export";
import type { AdminStoreSummary, AdminUser } from "@/lib/types/admin";

describe("global product metrics CSV (A-102)", () => {
  it("neutralises a formula in a store-controlled category name", () => {
    const csv = buildGlobalProductMetricsCsv({
      totalSkus: 120,
      mostStockedCategoryName: "=HYPERLINK(\"http://evil\",\"click\")",
      mostStockedCategoryGrowth: "12%",
      stockAlertRate: "3%",
      stockAlertCount: 4,
      complianceRate: "98%",
      complianceStatus: "Compliant",
    });

    expect(csv).toContain("\"'=HYPERLINK(");
    expect(csv).not.toContain('"=HYPERLINK(');
  });

  it("still quotes and escapes ordinary values", () => {
    const csv = buildGlobalProductMetricsCsv({
      totalSkus: 1,
      mostStockedCategoryName: 'Anti "malarials", assorted',
      mostStockedCategoryGrowth: "0%",
      stockAlertRate: "0%",
      stockAlertCount: 0,
      complianceRate: "0%",
      complianceStatus: "Unknown",
    });

    expect(csv.split("\n")[0]).toBe('"Metric","Value"');
    expect(csv).toContain('"Anti ""malarials"", assorted"');
  });
});

describe("page-scoped exports report an empty page (A-103)", () => {
  beforeEach(() => {
    vi.stubGlobal("URL", {
      createObjectURL: vi.fn(() => "blob:test"),
      revokeObjectURL: vi.fn(),
    });
  });

  it("downloadStoreFleetCsv returns false when the current page is empty", () => {
    expect(downloadStoreFleetCsv([])).toBe(false);
    expect(
      downloadStoreFleetCsv([
        {
          id: "s1",
          name: "Pikarestiv",
          owner: "Ada",
          email: "ada@dumosrx.com",
          plan: "pro",
          status: "Active",
          date: "Jan 02, 2026",
        } as AdminStoreSummary,
      ]),
    ).toBe(true);
  });

  it("downloadUserDirectoryCsv returns false when the current page is empty", () => {
    expect(downloadUserDirectoryCsv([])).toBe(false);
    expect(
      downloadUserDirectoryCsv([
        {
          id: "u1",
          name: "Ada Owner",
          email: "ada@dumosrx.com",
          role: "store_owner",
          store: "Pikarestiv",
          status: "Active",
        } as AdminUser,
      ]),
    ).toBe(true);
  });
});
