import { describe, it, expect, vi, beforeEach } from "vitest";

const scope = vi.hoisted(() => ({ user: null as Record<string, unknown> | null, tags: {} as Record<string, unknown> }));

vi.mock("@sentry/nextjs", () => ({
  setUser: (user: Record<string, unknown> | null) => {
    scope.user = user;
  },
  setTag: (key: string, value: unknown) => {
    scope.tags[key] = value;
  },
}));

import { applySentryIdentity } from "@/lib/utils/sentry-identity";

beforeEach(() => {
  scope.user = null;
  scope.tags = {};
});

describe("applySentryIdentity", () => {
  it("names the store and the staff member so an error report says who hit it", () => {
    applySentryIdentity(
      { id: "u1", username: "ada", first_name: "Ada", last_name: "Obi", role: "cashier" },
      { id: "s1", name: "Dumos Pharmacy", store_type: "pharmacy" },
    );

    expect(scope.tags).toMatchObject({ store_id: "s1", store_name: "Dumos Pharmacy", store_type: "pharmacy", staff_name: "Ada Obi", staff_role: "cashier" });
    expect(scope.user).toMatchObject({ id: "u1", username: "ada", name: "Ada Obi", role: "cashier" });
  });

  it("falls back to the username when the staff member has no name", () => {
    applySentryIdentity({ id: "u1", username: "front-desk", first_name: "", last_name: null }, { id: "s1", name: "Shop" });

    expect(scope.tags.staff_name).toBe("front-desk");
  });

  it("clears the staff identity on sign-out but still names the store", () => {
    applySentryIdentity({ id: "u1", username: "ada", first_name: "Ada" }, { id: "s1", name: "Shop" });

    applySentryIdentity(null, { id: "s1", name: "Shop" });

    expect(scope.user).toBeNull();
    expect(scope.tags.staff_name).toBeUndefined();
    expect(scope.tags.store_name).toBe("Shop");
  });
});
