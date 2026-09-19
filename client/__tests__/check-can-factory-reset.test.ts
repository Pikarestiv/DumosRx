import { describe, it, expect } from "vitest";
import { checkCanFactoryReset } from "@/lib/context/auth-context";

/**
 * checkCanFactoryReset gates the Factory Reset button/dialog in
 * Settings > Data (components/settings/data-settings.tsx). Deliberately
 * narrower than checkIsAdmin, which also passes "manager" - wiping every
 * local table and disconnecting cloud sync shouldn't be something a
 * manager can trigger unilaterally.
 */
describe("checkCanFactoryReset", () => {
  it("allows the store owner", () => {
    expect(checkCanFactoryReset("store_owner")).toBe(true);
  });

  it("allows the main/default admin account", () => {
    expect(checkCanFactoryReset("admin")).toBe(true);
  });

  it("allows super_admin", () => {
    expect(checkCanFactoryReset("super_admin")).toBe(true);
  });

  it("does not allow a manager", () => {
    expect(checkCanFactoryReset("manager")).toBe(false);
  });

  it("does not allow sales_staff, specialist, or auditor", () => {
    expect(checkCanFactoryReset("sales_staff")).toBe(false);
    expect(checkCanFactoryReset("specialist")).toBe(false);
    expect(checkCanFactoryReset("auditor")).toBe(false);
  });

  it("returns false for missing/undefined role", () => {
    expect(checkCanFactoryReset(undefined)).toBe(false);
    expect(checkCanFactoryReset("")).toBe(false);
  });
});
