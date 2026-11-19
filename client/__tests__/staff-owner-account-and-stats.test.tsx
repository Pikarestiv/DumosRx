import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import { validateStaffForm, buildStaffUpdatePayload } from "@/components/settings/staff/staff-form-dialog";
import { StaffStats } from "@/components/settings/staff/staff-stats";
import { StaffFormFields, type StaffFormData } from "@/components/settings/staff/staff-form-fields";
import type { StaffListItem } from "@/lib/types/user";
import { drainInputOtpSyncTimeouts } from "./helpers/input-otp-timers";

drainInputOtpSyncTimeouts();

if (typeof globalThis.ResizeObserver === "undefined") {
  globalThis.ResizeObserver = class {
    observe() {}
    unobserve() {}
    disconnect() {}
  } as unknown as typeof ResizeObserver;
}

vi.mock("@/lib/hooks/use-permission-groups", () => ({
  usePermissionGroups: () => ({
    groups: [{ id: "g1", name: "Manager", based_on_role: "manager", is_default: true, permissions: [] }],
  }),
}));

function form(overrides: Partial<StaffFormData> = {}): StaffFormData {
  return {
    first_name: "Ada",
    last_name: "Owner",
    username: "ada",
    email: "",
    pin: "",
    role: "store_owner",
    store_id: "store1",
    permission_group_id: undefined,
    ...overrides,
  };
}

const person = (id: string, role: string, is_active = 1) => ({ id, role, is_active }) as unknown as StaffListItem;

describe("editing the store owner's own account", () => {
  it("does not demand a group the owner cannot have", () => {
    expect(validateStaffForm(form(), true)).toBeNull();
  });

  it("still demands a group for every other role", () => {
    expect(validateStaffForm(form({ role: "sales_staff" }), true)).toMatch(/group/i);
  });

  it("never sends a role or group change for the owner, so the owner cannot be demoted by saving", () => {
    expect(buildStaffUpdatePayload(form({ permission_group_id: "g1" }))).toEqual({
      first_name: "Ada",
      last_name: "Owner",
      username: "ada",
      email: "",
    });
  });

  it("sends the role and group for staff as before", () => {
    expect(buildStaffUpdatePayload(form({ role: "manager", permission_group_id: "g1" }))).toMatchObject({
      role: "manager",
      permission_group_id: "g1",
    });
  });

  it("shows the owner as having full access instead of a group picker", () => {
    render(
      <StaffFormFields formId="f" onSubmit={() => {}} formData={form()} setFormData={() => {}} isEditing availableStores={[]} />,
    );

    expect(screen.getByText(/full access/i)).toBeTruthy();
    expect(screen.queryByText("Select group")).toBeNull();
  });

  it("still shows the group picker for staff", () => {
    render(
      <StaffFormFields
        formId="f"
        onSubmit={() => {}}
        formData={form({ role: "manager", permission_group_id: "g1" })}
        setFormData={() => {}}
        isEditing
        availableStores={[]}
      />,
    );

    expect(screen.queryByText(/full access/i)).toBeNull();
    expect(screen.getAllByText("Manager").length).toBeGreaterThan(0);
  });
});

describe("staff stat cards", () => {
  it("counts active accounts the way total staff is counted, without the store owner", () => {
    const users = [person("o", "store_owner"), person("a", "manager"), person("b", "sales_staff"), person("c", "sales_staff", 0)];
    render(<StaffStats users={users} totalStaffCount={2} maxStaffAccounts={Infinity} />);

    expect(screen.getByText("Active accounts").parentElement?.textContent).toContain("2");
    expect(screen.getByText(/excludes the store owner/i)).toBeTruthy();
  });
});
