import { describe, it, expect } from "vitest";
import { sidebarItems, visibleSidebarItems } from "@/components/admin/sidebar-items";

describe("visibleSidebarItems", () => {
  it("still shows a role-only item to a user whose role matches", () => {
    const items = visibleSidebarItems({ role: "super_admin", effective_permissions: [] });
    expect(items.length).toBeGreaterThan(0);
  });

  it("shows a permission-gated item to an agent who holds the permission", () => {
    const stores = sidebarItems.find((i) => i.id === "stores");
    expect(stores?.permissions).toContain("view_platform_data");

    const items = visibleSidebarItems({ role: "agent", effective_permissions: ["view_platform_data"] });
    expect(items.some((i) => i.id === "stores")).toBe(true);
  });

  it("hides a permission-gated item from an agent who lacks the permission", () => {
    const items = visibleSidebarItems({ role: "agent", effective_permissions: [] });
    expect(items.some((i) => i.id === "stores")).toBe(false);
  });

  it("shows Communications to a platform_admin/agent holding send_notifications", () => {
    const communications = sidebarItems.find((i) => i.id === "communications");
    expect(communications?.permissions).toContain("send_notifications");

    for (const role of ["platform_admin", "agent"]) {
      const items = visibleSidebarItems({ role, effective_permissions: ["send_notifications"] });
      expect(items.some((i) => i.id === "communications")).toBe(true);
    }
  });

  it("hides Communications from a platform_admin/agent lacking send_notifications", () => {
    for (const role of ["platform_admin", "agent"]) {
      const items = visibleSidebarItems({ role, effective_permissions: [] });
      expect(items.some((i) => i.id === "communications")).toBe(false);
    }
  });

  it("gives a custom platform role a real post-login landing page (A-141)", () => {
    const items = visibleSidebarItems({
      role: "support_lead",
      effective_permissions: ["manage_platform", "view_platform_data"],
    });

    expect(items[0]?.href).toBe("/admin/users");
  });

  it("returns no items for a custom platform role holding none of the catalog permissions", () => {
    const items = visibleSidebarItems({ role: "support_lead", effective_permissions: ["manage_platform"] });

    expect(items).toHaveLength(0);
  });
});
