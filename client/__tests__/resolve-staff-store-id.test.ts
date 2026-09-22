import { describe, it, expect } from "vitest";
import { resolveStaffStoreId } from "@/components/settings/staff/staff-form-dialog";

/**
 * Regression coverage: staff-form-dialog.tsx used to write
 * `store_id: activeStoreId || ""` — an empty string, not null, when no
 * store was active. That matches neither `store_id = ?` nor the
 * `store_id IS NULL` fallback getUsers() checks for, making the account
 * invisible in every staff list while still able to log in.
 */
describe("resolveStaffStoreId", () => {
  it("uses the form's selected store when set", () => {
    expect(resolveStaffStoreId("store-a", "store-b")).toBe("store-a");
  });

  it("falls back to the active store when the form has no selection", () => {
    expect(resolveStaffStoreId("", "store-b")).toBe("store-b");
  });

  it("returns null, never an empty string, when neither is set", () => {
    expect(resolveStaffStoreId("", null)).toBeNull();
  });
});
