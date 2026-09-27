import { describe, it, expect } from "vitest";

describe("hasPermission", () => {
  it("grants everything to store_owner and super_admin regardless of group", async () => {
    const { hasPermission } = await import("@/lib/hooks/use-permissions");
    expect(hasPermission({ role: "store_owner" }, null, "factory_reset")).toBe(true);
    expect(hasPermission({ role: "super_admin" }, null, "factory_reset")).toBe(true);
  });

  it("checks the assigned group's permissions array for every other role", async () => {
    const { hasPermission } = await import("@/lib/hooks/use-permissions");
    const group = { permissions: ["process_sales", "manage_customers"] };
    expect(hasPermission({ role: "sales_staff" }, group, "process_sales")).toBe(true);
    expect(hasPermission({ role: "sales_staff" }, group, "factory_reset")).toBe(false);
  });

  it("supports any/all mode for multiple keys", async () => {
    const { hasPermission } = await import("@/lib/hooks/use-permissions");
    const group = { permissions: ["process_sales"] };
    expect(hasPermission({ role: "sales_staff" }, group, ["process_sales", "manage_staff"], "any")).toBe(true);
    expect(hasPermission({ role: "sales_staff" }, group, ["process_sales", "manage_staff"], "all")).toBe(false);
  });

  it("falls back to today's role-string logic when no group is synced yet", async () => {
    const { hasPermission } = await import("@/lib/hooks/use-permissions");
    // Fallback reproduces checkCanProcessSales: manager/specialist/sales_staff/admin/store_owner grant it, auditor doesn't.
    expect(hasPermission({ role: "sales_staff" }, null, "process_sales")).toBe(true);
    expect(hasPermission({ role: "auditor" }, null, "process_sales")).toBe(false);
    // Fallback reproduces checkCanFactoryReset: only admin/store_owner/super_admin.
    expect(hasPermission({ role: "manager" }, null, "factory_reset")).toBe(false);
    expect(hasPermission({ role: "admin" }, null, "factory_reset")).toBe(true);
  });

  it("does not throw when a user object has no role yet (a transitional/partial session)", async () => {
    const { hasPermission } = await import("@/lib/hooks/use-permissions");
    expect(hasPermission({ role: undefined as unknown as string }, null, "process_sales")).toBe(false);
    expect(hasPermission({ role: "" }, null, "process_sales")).toBe(false);
  });
});
