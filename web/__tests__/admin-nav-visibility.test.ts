import { describe, it, expect } from "vitest";
import { visibleSidebarItems, sidebarItems } from "@/components/admin/sidebar-items";

const roleWith = (permissions: string[]) => ({
  role: "custom_platform_role",
  effective_permissions: permissions,
});

describe("admin nav visibility", () => {
  it("exposes an operations entry", () => {
    expect(sidebarItems.map((i) => i.id)).toContain("operations");
  });

  /** GET /admin/health and /admin/errors are `role:super_admin` server-side,
   * so advertising Operations to a delegated role renders a page whose only
   * data call 403s. Nav visibility must match the endpoint's real gate. */
  it("does not advertise operations to a delegated role that cannot load it", () => {
    const ids = visibleSidebarItems(roleWith(["manage_platform", "view_platform_data"])).map(
      (i) => i.id,
    );

    expect(ids).not.toContain("operations");
    expect(ids).toContain("users");
  });

  it("hides items a custom role lacks permission for", () => {
    const ids = visibleSidebarItems(roleWith(["manage_platform"])).map((i) => i.id);

    expect(ids).not.toContain("users");
    expect(ids).not.toContain("activity");
    expect(ids).not.toContain("operations");
  });

  it("still shows every item to super_admin", () => {
    const ids = visibleSidebarItems({ role: "super_admin", effective_permissions: [] }).map(
      (i) => i.id,
    );

    expect(ids).toContain("operations");
    expect(ids).toContain("users");
    expect(ids).toContain("settings");
  });

  it("no longer routes anyone to the retired system page", () => {
    expect(sidebarItems.map((i) => i.href)).not.toContain("/admin/system");
  });
});
