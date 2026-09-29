import { describe, it, expect } from "vitest";
import { PERMISSION_CATALOG, DEFAULT_GROUP_PERMISSIONS, ENFORCED_PERMISSION_KEYS } from "@/lib/constants/permissions";

describe("permission catalog", () => {
  it("every default role has a defined permission set", () => {
    expect(Object.keys(DEFAULT_GROUP_PERMISSIONS).sort()).toEqual(
      ["admin", "auditor", "manager", "sales_staff", "specialist"].sort(),
    );
  });

  it("every permission key in DEFAULT_GROUP_PERMISSIONS exists in the catalog", () => {
    const catalogKeys = new Set(PERMISSION_CATALOG.map((p) => p.key));
    for (const role of Object.keys(DEFAULT_GROUP_PERMISSIONS) as (keyof typeof DEFAULT_GROUP_PERMISSIONS)[]) {
      for (const key of DEFAULT_GROUP_PERMISSIONS[role]) {
        expect(catalogKeys.has(key)).toBe(true);
      }
    }
  });

  it("admin's default set is a superset of manager's", () => {
    const adminSet = new Set(DEFAULT_GROUP_PERMISSIONS.admin);
    for (const key of DEFAULT_GROUP_PERMISSIONS.manager) {
      expect(adminSet.has(key)).toBe(true);
    }
  });

  it("auditor cannot process sales but can view reports", () => {
    expect(DEFAULT_GROUP_PERMISSIONS.auditor).not.toContain("process_sales");
    expect(DEFAULT_GROUP_PERMISSIONS.auditor).toContain("view_reports");
  });

  it("has no duplicate permission keys", () => {
    const keys = PERMISSION_CATALOG.map((p) => p.key);
    expect(new Set(keys).size).toBe(keys.length);
  });

  it("assigns every entry one of the eight known categories", () => {
    const known = new Set([
      "Sales & POS",
      "Inventory & Stock",
      "Prescriptions",
      "Customers & Loyalty",
      "Reports & Activity",
      "Expenses",
      "Staff & Groups",
      "Store & Settings",
    ]);
    for (const entry of PERMISSION_CATALOG) {
      expect(known.has(entry.category)).toBe(true);
      expect(entry.label.trim().length).toBeGreaterThan(0);
    }
  });

  it("gives every non-admin default set no key outside the catalog and no duplicates", () => {
    for (const role of Object.keys(DEFAULT_GROUP_PERMISSIONS) as (keyof typeof DEFAULT_GROUP_PERMISSIONS)[]) {
      const keys = DEFAULT_GROUP_PERMISSIONS[role];
      expect(new Set(keys).size).toBe(keys.length);
    }
  });

  it("keeps the cashier default free of cost/margin visibility", () => {
    expect(DEFAULT_GROUP_PERMISSIONS.sales_staff).not.toContain("view_cost_fields");
    expect(DEFAULT_GROUP_PERMISSIONS.sales_staff).not.toContain("view_financial_reports");
  });

  it("grants the read-only auditor no write-side granular key", () => {
    for (const key of DEFAULT_GROUP_PERMISSIONS.auditor) {
      expect(key.startsWith("delete_")).toBe(false);
      expect(key.startsWith("edit_")).toBe(false);
    }
  });

  it("carries the two restored delete keys, enforced, under Inventory & Stock", () => {
    for (const key of ["delete_products", "delete_suppliers"]) {
      const entry = PERMISSION_CATALOG.find((p) => p.key === key);
      expect(entry).toBeDefined();
      expect(entry?.category).toBe("Inventory & Stock");
      expect(ENFORCED_PERMISSION_KEYS.has(key)).toBe(true);
      expect(DEFAULT_GROUP_PERMISSIONS.manager).toContain(key);
      expect(DEFAULT_GROUP_PERMISSIONS.specialist).not.toContain(key);
      expect(DEFAULT_GROUP_PERMISSIONS.sales_staff).not.toContain(key);
      expect(DEFAULT_GROUP_PERMISSIONS.auditor).not.toContain(key);
    }
  });

  it("every key in ENFORCED_PERMISSION_KEYS exists in the catalog", () => {
    const catalogKeys = new Set(PERMISSION_CATALOG.map((p) => p.key));
    for (const key of ENFORCED_PERMISSION_KEYS) {
      expect(catalogKeys.has(key)).toBe(true);
    }
  });
});
