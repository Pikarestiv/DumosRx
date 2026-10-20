import { describe, it, expect } from "vitest";
import { checkIsAdmin } from "@/lib/context/auth-context";

// Regression coverage: checkIsAdmin used to test `normalizedRole.includes(...)` (a substring match) instead of exact array…
// Rationale: docs/CLIENT_COMMENTS.md#block-__tests__-check-is-admin-test-ts-L4
describe("checkIsAdmin", () => {
  it("allows admin, manager, store_owner, and super_admin", () => {
    expect(checkIsAdmin("admin")).toBe(true);
    expect(checkIsAdmin("manager")).toBe(true);
    expect(checkIsAdmin("store_owner")).toBe(true);
    // super_admin must stay included — a prior fix (pos-transaction-history) switched to checkIsAdmin specifically because the…
    // Rationale: docs/CLIENT_COMMENTS.md#line-__tests__-check-is-admin-test-ts-L17
    expect(checkIsAdmin("super_admin")).toBe(true);
  });

  it("does not allow sales_staff, specialist, or auditor", () => {
    expect(checkIsAdmin("sales_staff")).toBe(false);
    expect(checkIsAdmin("specialist")).toBe(false);
    expect(checkIsAdmin("auditor")).toBe(false);
  });

  it("does not match a role that merely contains 'admin' as a substring", () => {
    expect(checkIsAdmin("sub_administrator")).toBe(false);
    expect(checkIsAdmin("co_manager_trainee")).toBe(false);
  });

  it("returns false for missing/undefined role", () => {
    expect(checkIsAdmin(undefined)).toBe(false);
    expect(checkIsAdmin("")).toBe(false);
  });
});
