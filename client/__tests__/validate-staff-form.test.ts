import { describe, it, expect } from "vitest";
import { validateStaffForm } from "@/components/settings/staff/staff-form-dialog";
import type { StaffFormData } from "@/components/settings/staff/staff-form-fields";

function form(overrides: Partial<StaffFormData> = {}): StaffFormData {
  return {
    first_name: "John",
    last_name: "Doe",
    username: "johndoe",
    email: "",
    pin: "1234",
    role: "sales_staff",
    store_id: "store1",
    permission_group_id: "g1",
    ...overrides,
  };
}

describe("validateStaffForm", () => {
  it("accepts a fully filled-in new staff member", () => {
    expect(validateStaffForm(form(), false)).toBeNull();
  });

  it("blocks submission when no Group was selected", () => {
    expect(validateStaffForm(form({ permission_group_id: undefined }), false)).toMatch(/group/i);
    expect(validateStaffForm(form({ permission_group_id: "" }), false)).toMatch(/group/i);
  });

  it("blocks an edit that leaves the Group unselected too", () => {
    expect(validateStaffForm(form({ permission_group_id: undefined, pin: "" }), true)).toMatch(/group/i);
  });

  it("still enforces the pre-existing required fields and PIN rules", () => {
    expect(validateStaffForm(form({ first_name: "" }), false)).toMatch(/required/i);
    expect(validateStaffForm(form({ username: "" }), false)).toMatch(/required/i);
    expect(validateStaffForm(form({ pin: "12" }), false)).toMatch(/PIN/);
    expect(validateStaffForm(form({ pin: "" }), false)).toMatch(/PIN/);
    // Editing without touching the PIN keeps it as-is.
    expect(validateStaffForm(form({ pin: "" }), true)).toBeNull();
    expect(validateStaffForm(form({ pin: "12" }), true)).toMatch(/PIN/);
  });
});
