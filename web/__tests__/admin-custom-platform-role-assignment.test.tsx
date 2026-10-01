import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, within } from "@testing-library/react";

const { roleOptions } = vi.hoisted(() => ({
  roleOptions: {
    current: [
      { value: "platform_admin", label: "Platform Admin", description: "Built in" },
      { value: "agent", label: "Agent", description: "Built in" },
      { value: "super_admin", label: "Super Admin", description: "Built in" },
      { value: "support_lead", label: "Support Lead", description: "Custom platform role" },
    ],
  },
}));

vi.mock("@/hooks/use-platform-role-options", () => ({
  usePlatformRoleOptions: () => roleOptions.current,
}));

vi.mock("next/navigation", () => ({ useRouter: () => ({ push: vi.fn() }) }));

const { viewerRole } = vi.hoisted(() => ({ viewerRole: { current: "super_admin" } }));

vi.mock("@/lib/store/use-admin-auth-store", () => ({
  useAdminAuthStore: (selector?: (state: { user: { role: string } | null }) => unknown) => {
    const state = { user: { role: viewerRole.current } };
    return selector ? selector(state) : state;
  },
  checkIsSuperAdmin: (role?: string) => role === "super_admin",
}));

vi.mock("@/lib/api/admin-hooks-users", () => ({
  useUpdateUserProfileMutation: () => ({ mutateAsync: vi.fn(), isPending: false }),
}));

vi.mock("@/lib/api/admin-hooks-roles", () => ({
  useUpdateUserPermissionOverridesMutation: () => ({ mutateAsync: vi.fn(), isPending: false }),
  useAdminRoles: () => ({ data: { roles: [] } }),
}));

import {
  mergePlatformRoleOptions,
  platformRoleSlugsFrom,
} from "@/lib/constants/platform-roles";
import {
  validateUserProfileEdit,
  buildUserProfileUpdate,
} from "@/components/admin/users/user-profile-edit-validation";
import { UserProfileEditForm } from "@/components/admin/users/user-profile-edit-form";
import { UserProfileDialog } from "@/components/admin/users/user-profile-dialog";
import type { AdminUser } from "@/lib/types/admin";

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
  role: "platform_admin",
};

beforeEach(() => {
  viewerRole.current = "super_admin";
  Element.prototype.hasPointerCapture = Element.prototype.hasPointerCapture ?? (() => false);
  Element.prototype.scrollIntoView = Element.prototype.scrollIntoView ?? (() => {});
});

describe("mergePlatformRoleOptions", () => {
  it("keeps the 3 built-ins and appends a custom role", () => {
    const merged = mergePlatformRoleOptions([{ name: "Support Lead", slug: "support_lead" }]);

    expect(merged.map((option) => option.value)).toEqual([
      "platform_admin",
      "agent",
      "super_admin",
      "support_lead",
    ]);
  });

  it("never duplicates a built-in the roles endpoint also returns", () => {
    const slugs = platformRoleSlugsFrom([
      { name: "Platform Admin", slug: "platform_admin" },
      { name: "Support Lead", slug: "support_lead" },
    ]);

    expect(slugs).toEqual(["platform_admin", "agent", "super_admin", "support_lead"]);
  });
});

describe("validateUserProfileEdit with custom roles", () => {
  it("accepts a custom role slug when it is in the allowed set", () => {
    const errors = validateUserProfileEdit({ ...baseValues, role: "support_lead" }, [
      "platform_admin",
      "agent",
      "super_admin",
      "support_lead",
    ]);

    expect(errors.role).toBeUndefined();
  });

  it("still rejects a store-tenant role slug", () => {
    const errors = validateUserProfileEdit({ ...baseValues, role: "store_owner" }, [
      "platform_admin",
      "agent",
      "super_admin",
      "support_lead",
    ]);

    expect(errors.role).toBeTruthy();
  });

  it("keeps a target's custom role as the unchanged original, so it is never resent", () => {
    const customRoleUser: AdminUser = { ...target, role_slug: "support_lead" };

    expect(
      buildUserProfileUpdate(
        customRoleUser,
        { ...baseValues, role: "support_lead" },
        ["platform_admin", "agent", "super_admin", "support_lead"],
      ),
    ).toEqual({});
  });
});

describe("UserProfileEditForm role picker", () => {
  it("offers a custom platform role and saves it as the new role", async () => {
    const onSave = vi.fn();
    render(
      <UserProfileEditForm user={target} onCancel={() => {}} onSave={onSave} isPending={false} />,
    );

    fireEvent.click(screen.getByLabelText("Role"));
    const listbox = await screen.findByRole("listbox");
    fireEvent.click(within(listbox).getByText("Support Lead"));

    fireEvent.click(screen.getByRole("button", { name: "Save Changes" }));

    expect(onSave).toHaveBeenCalledWith({ role: "support_lead" });
  });
});

describe("UserProfileDialog — Manage Permissions for a custom role", () => {
  it("offers Manage Permissions for a user on a custom platform role", () => {
    render(
      <UserProfileDialog
        isOpen
        onOpenChange={() => {}}
        selectedUser={{ ...target, role_slug: "support_lead" }}
      />,
    );

    expect(screen.getByRole("button", { name: /Manage Permissions/i })).toBeInTheDocument();
  });

  it("still hides Manage Permissions for a store-tenant account", () => {
    render(
      <UserProfileDialog
        isOpen
        onOpenChange={() => {}}
        selectedUser={{ ...target, role_slug: "store_owner" }}
      />,
    );

    expect(screen.queryByRole("button", { name: /Manage Permissions/i })).not.toBeInTheDocument();
  });
});
