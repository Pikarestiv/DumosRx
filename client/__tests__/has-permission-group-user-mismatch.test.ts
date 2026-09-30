import { describe, it, expect } from "vitest";

/**
 * A-55: on a lock-screen "switch account" (user -> user, no logout in
 * between) AuthContext still holds the OUTGOING user's permission group
 * until the async read for the incoming user resolves. hasPermission() must
 * therefore refuse to evaluate a group that belongs to someone else and
 * fall back to the incoming user's role tier instead.
 */
describe("hasPermission — group/user identity mismatch", () => {
  it("ignores a permission group belonging to a different user and falls back to the role tier", async () => {
    const { hasPermission } = await import("@/lib/hooks/use-permissions");
    const outgoingAdminsGroup = {
      userId: "admin-1",
      id: "group-admin",
      permissions: ["manage_staff", "view_activity_log", "manage_products"],
    };
    const incomingCashier = { id: "cashier-2", role: "sales_staff" };

    expect(hasPermission(incomingCashier, outgoingAdminsGroup, "manage_staff")).toBe(false);
    expect(hasPermission(incomingCashier, outgoingAdminsGroup, "view_activity_log")).toBe(false);
    // Role-tier fallback still grants what a sales_staff genuinely has.
    expect(hasPermission(incomingCashier, outgoingAdminsGroup, "process_sales")).toBe(true);
  });

  it("uses the group when it belongs to the acting user", async () => {
    const { hasPermission } = await import("@/lib/hooks/use-permissions");
    const ownGroup = { userId: "cashier-2", id: "g", permissions: ["manage_staff"] };
    expect(hasPermission({ id: "cashier-2", role: "sales_staff" }, ownGroup, "manage_staff")).toBe(true);
  });

  it("still honours a group with no userId attached (assistant/tool contexts)", async () => {
    const { hasPermission } = await import("@/lib/hooks/use-permissions");
    const group = { permissions: ["manage_staff"] };
    expect(hasPermission({ id: "u1", role: "sales_staff" }, group, "manage_staff")).toBe(true);
  });
});
