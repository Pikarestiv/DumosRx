import { describe, it, expect } from "vitest";
import { checkCanAccessAdmin, checkHasPermission, checkIsSuperAdmin } from "@/lib/store/use-admin-auth-store";
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

describe("checkCanAccessAdmin", () => {
  it("returns true for super_admin even with no effective_permissions", () => {
    const user = makeUser({ role: "super_admin", effective_permissions: [] });
    expect(checkCanAccessAdmin(user)).toBe(true);
  });

  it("returns true for a built-in platform_admin who carries manage_platform", () => {
    const user = makeUser({ role: "platform_admin", effective_permissions: ["manage_platform"] });
    expect(checkCanAccessAdmin(user)).toBe(true);
  });

  it("returns true for a custom platform role that carries manage_platform", () => {
    const user = makeUser({ role: "support_lead", effective_permissions: ["manage_platform", "view_platform_data"] });
    expect(checkCanAccessAdmin(user)).toBe(true);
  });

  it("returns false for a store-tenant role with no manage_platform grant", () => {
    const user = makeUser({ role: "store_owner", effective_permissions: [] });
    expect(checkCanAccessAdmin(user)).toBe(false);
  });

  it("returns false for a null/undefined user", () => {
    expect(checkCanAccessAdmin(null)).toBe(false);
    expect(checkCanAccessAdmin(undefined)).toBe(false);
  });
});
