import { describe, it, expect } from "vitest";
import { checkHasPermission, checkIsSuperAdmin } from "@/lib/store/use-admin-auth-store";
import type { User } from "@/lib/store/use-admin-auth-store";

function makeUser(overrides: Partial<User>): User {
  return {
    id: "u1",
    email: "a@b.com",
    first_name: "A",
    last_name: "B",
    role: "agent",
    effective_permissions: [],
    ...overrides,
  };
}

describe("checkHasPermission", () => {
  it("returns true for super_admin regardless of effective_permissions", () => {
    const user = makeUser({ role: "super_admin", effective_permissions: [] });
    expect(checkHasPermission(user, "impersonate_store")).toBe(true);
  });

  it("returns true when the slug is in effective_permissions", () => {
    const user = makeUser({ effective_permissions: ["view_platform_data"] });
    expect(checkHasPermission(user, "view_platform_data")).toBe(true);
  });

  it("returns false when the slug is absent", () => {
    const user = makeUser({ effective_permissions: ["view_platform_data"] });
    expect(checkHasPermission(user, "impersonate_store")).toBe(false);
  });

  it("returns false for a null user", () => {
    expect(checkHasPermission(null, "view_platform_data")).toBe(false);
  });
});
