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

  it("every key in ENFORCED_PERMISSION_KEYS exists in the catalog", () => {
    const catalogKeys = new Set(PERMISSION_CATALOG.map((p) => p.key));
    for (const key of ENFORCED_PERMISSION_KEYS) {
      expect(catalogKeys.has(key)).toBe(true);
    }
  });
});
