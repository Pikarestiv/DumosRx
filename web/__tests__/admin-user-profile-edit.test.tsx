import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import {
  buildUserProfileUpdate,
  validateUserProfileEdit,
} from "@/components/admin/users/user-profile-edit-validation";
import { UserProfileEditForm } from "@/components/admin/users/user-profile-edit-form";
import { PLATFORM_ROLE_SLUGS, type AdminUser } from "@/lib/types/admin";
import { PLATFORM_ROLE_OPTIONS } from "@/lib/constants/platform-roles";

const target: AdminUser = {
  id: "11111111-2222-3333-4444-555555555555",
  name: "Ada Admin",
  first_name: "Ada",
  last_name: "Admin",
  phone: "08012345678",
  email: "ada@dumosrx.com",
  role: "Platform Admin",
  role_slug: "platform_admin",
  status: "Active",
};

const baseValues = {
  first_name: "Ada",
  last_name: "Admin",
  phone: "08012345678",
  email: "ada@dumosrx.com",
  role: "platform_admin" as const,
};

describe("validateUserProfileEdit", () => {
  it("accepts a well-formed set of values", () => {
    expect(validateUserProfileEdit(baseValues)).toEqual({});
  });

  it("rejects a malformed email", () => {
    const errors = validateUserProfileEdit({ ...baseValues, email: "not-an-email" });
    expect(errors.email).toBeTruthy();
  });

  it("requires first and last name", () => {
    const errors = validateUserProfileEdit({ ...baseValues, first_name: " ", last_name: "" });
    expect(errors.first_name).toBeTruthy();
    expect(errors.last_name).toBeTruthy();
  });

  it("rejects a role outside the three platform roles", () => {
    const errors = validateUserProfileEdit({
      ...baseValues,
      role: "store_owner" as unknown as (typeof PLATFORM_ROLE_SLUGS)[number],
    });
    expect(errors.role).toBeTruthy();
  });

  it("accepts every valid platform role", () => {
    for (const role of PLATFORM_ROLE_SLUGS) {
      expect(validateUserProfileEdit({ ...baseValues, role }).role).toBeUndefined();
    }
  });
});

describe("buildUserProfileUpdate", () => {
  it("sends only the fields that actually changed", () => {
    expect(buildUserProfileUpdate(target, { ...baseValues, first_name: "Grace" })).toEqual({
      first_name: "Grace",
    });
  });

  it("sends nothing when no field changed", () => {
    expect(buildUserProfileUpdate(target, baseValues)).toEqual({});
  });

  it("never includes password, status or plan fields", () => {
    const payload = buildUserProfileUpdate(target, { ...baseValues, role: "agent" });
    expect(Object.keys(payload)).toEqual(["role"]);
  });
});

describe("UserProfileEditForm", () => {
  it("offers only the three platform roles in its role select", () => {
    expect([...PLATFORM_ROLE_OPTIONS].map((o) => o.value).sort()).toEqual(
      [...PLATFORM_ROLE_SLUGS].sort(),
    );

    render(<UserProfileEditForm user={target} onCancel={() => {}} onSave={vi.fn()} isPending={false} />);
    expect(screen.getByLabelText("Role")).toBeTruthy();
  });

  it("blocks saving and shows an error for an invalid email", () => {
    const onSave = vi.fn();
    render(<UserProfileEditForm user={target} onCancel={() => {}} onSave={onSave} isPending={false} />);

    fireEvent.change(screen.getByLabelText("Email"), { target: { value: "bad" } });
    fireEvent.click(screen.getByRole("button", { name: "Save Changes" }));

    expect(onSave).not.toHaveBeenCalled();
    expect(screen.getByText(/valid email/i)).toBeTruthy();
  });

  it("saves only the changed fields", () => {
    const onSave = vi.fn();
    render(<UserProfileEditForm user={target} onCancel={() => {}} onSave={onSave} isPending={false} />);

    fireEvent.change(screen.getByLabelText("First Name"), { target: { value: "Grace" } });
    fireEvent.click(screen.getByRole("button", { name: "Save Changes" }));

    expect(onSave).toHaveBeenCalledWith({ first_name: "Grace" });
  });
});
