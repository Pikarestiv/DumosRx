import { describe, it, expect } from "vitest";
import {
  ALL_AUDIT_CATEGORIES,
  auditExportFileName,
  describeAuditLens,
  isAuditLensActive,
  type AuditLens,
} from "@/components/stock-batch/audit-derivations";
import type { AuditItem } from "@/components/stock-batch/stock-audits";

function item(overrides: Partial<AuditItem> = {}): AuditItem {
  return {
    id: "i1",
    name: "Panadol",
    sku: "SKU-1",
    category: "Analgesics",
    systemQty: 10,
    countedQty: undefined,
    ...overrides,
  };
}

const NO_LENS: AuditLens = {
  category: ALL_AUDIT_CATEGORIES,
  status: "all",
  search: "",
};

const sheet: AuditItem[] = [
  item({ id: "a", name: "Panadol", sku: "P-1", category: "Analgesics" }),
  item({ id: "b", name: "Amoxil", sku: "A-1", category: "Antibiotics", countedQty: 10 }),
  item({ id: "c", name: "Amoxiclav", sku: "A-2", category: "Antibiotics", countedQty: 7 }),
  item({ id: "d", name: "Flagyl", sku: "F-1", category: "Antibiotics" }),
  item({ id: "e", name: "Vitamin C", sku: "V-1", category: "Vitamins", countedQty: 3 }),
];

const ids = (rows: AuditItem[]) => rows.map((r) => r.id);

describe("describeAuditLens", () => {
  it("keeps today's wording when nothing is filtered", () => {
    expect(describeAuditLens(NO_LENS, 5, 5)).toBe("5 product(s)");
  });

  it("names each filter on its own", () => {
    expect(describeAuditLens({ ...NO_LENS, category: "Antibiotics" }, 3, 5)).toBe(
      "3 of 5 product(s) · Category: Antibiotics",
    );
    expect(describeAuditLens({ ...NO_LENS, status: "uncounted" }, 2, 5)).toBe(
      "2 of 5 product(s) · Not Counted",
    );
    expect(describeAuditLens({ ...NO_LENS, status: "counted" }, 3, 5)).toBe(
      "3 of 5 product(s) · Counted",
    );
    expect(describeAuditLens({ ...NO_LENS, status: "differences" }, 2, 5)).toBe(
      "2 of 5 product(s) · Qty Differences",
    );
    expect(describeAuditLens({ ...NO_LENS, search: " amox " }, 2, 5)).toBe(
      '2 of 5 product(s) · Search: "amox"',
    );
  });

  it("names every filter together", () => {
    expect(
      describeAuditLens(
        { category: "Antibiotics", status: "differences", search: "amox" },
        1,
        1310,
      ),
    ).toBe('1 of 1310 product(s) · Category: Antibiotics · Qty Differences · Search: "amox"');
  });
});

describe("isAuditLensActive", () => {
  it("is false only when no dimension is set", () => {
    expect(isAuditLensActive(NO_LENS)).toBe(false);
    expect(isAuditLensActive({ ...NO_LENS, search: "   " })).toBe(false);
    expect(isAuditLensActive({ ...NO_LENS, category: "Vitamins" })).toBe(true);
    expect(isAuditLensActive({ ...NO_LENS, status: "counted" })).toBe(true);
    expect(isAuditLensActive({ ...NO_LENS, search: "pan" })).toBe(true);
  });
});

describe("auditExportFileName", () => {
  const date = new Date("2026-10-23T10:00:00Z");

  it("keeps today's name when no category is selected", () => {
    expect(auditExportFileName(NO_LENS, "csv", date)).toBe("StockAudit_2026-10-23.csv");
  });

  it("adds the category, sanitised to letters, digits and hyphens", () => {
    expect(
      auditExportFileName({ ...NO_LENS, category: "Antibiotics" }, "xlsx", date),
    ).toBe("StockAudit_2026-10-23_Antibiotics.xlsx");
    expect(
      auditExportFileName({ ...NO_LENS, category: "Cough & Cold / Kids" }, "csv", date),
    ).toBe("StockAudit_2026-10-23_Cough-Cold-Kids.csv");
    expect(
      auditExportFileName({ ...NO_LENS, category: "Uncategorized" }, "pdf", date),
    ).toBe("StockAudit_2026-10-23_Uncategorized.pdf");
  });

  it("transliterates accented letters instead of dropping them", () => {
    expect(
      auditExportFileName({ ...NO_LENS, category: "Médicaments" }, "csv", date),
    ).toBe("StockAudit_2026-10-23_Medicaments.csv");
  });

  it("drops a category with no safe characters left", () => {
    expect(auditExportFileName({ ...NO_LENS, category: "../" }, "csv", date)).toBe(
      "StockAudit_2026-10-23.csv",
    );
  });
});
