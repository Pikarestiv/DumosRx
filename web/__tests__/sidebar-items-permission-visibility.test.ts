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
});
