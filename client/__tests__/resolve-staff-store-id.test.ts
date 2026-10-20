import { describe, it, expect } from "vitest";
import { resolveStaffStoreId } from "@/components/settings/staff/staff-form-dialog";

// Regression coverage: staff-form-dialog.tsx used to write `store_id:
// Rationale: docs/CLIENT_COMMENTS.md#block-__tests__-resolve-staff-store-id-test-ts-L4
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
