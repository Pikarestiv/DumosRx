import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import { UserProfileDialog } from "@/components/admin/users/user-profile-dialog";
import type { AdminUser } from "@/lib/types/admin";

const { viewerRole } = vi.hoisted(() => ({ viewerRole: { current: "super_admin" } }));

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn() }),
}));

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
}));

function buildUser(overrides: Partial<AdminUser>): AdminUser {
  return {
    id: "u1",
    name: "Target User",
    email: "target@dumosrx.com",
    role: "Platform Admin",
    role_slug: "platform_admin",
    status: "Active",
    ...overrides,
  };
}

describe("UserProfileDialog — Manage Permissions gate", () => {
  it("shows Manage Permissions for a platform_admin target when the viewer is super_admin", () => {
    viewerRole.current = "super_admin";
    render(
      <UserProfileDialog
        isOpen
        onOpenChange={vi.fn()}
        selectedUser={buildUser({ role_slug: "platform_admin" })}
      />,
    );
    expect(screen.getByRole("button", { name: /manage permissions/i })).toBeInTheDocument();
  });

  it("shows Manage Permissions for an agent target when the viewer is super_admin", () => {
    viewerRole.current = "super_admin";
    render(
      <UserProfileDialog
        isOpen
        onOpenChange={vi.fn()}
        selectedUser={buildUser({ role: "Agent", role_slug: "agent" })}
      />,
    );
    expect(screen.getByRole("button", { name: /manage permissions/i })).toBeInTheDocument();
  });

  it("hides Manage Permissions for a super_admin target", () => {
    viewerRole.current = "super_admin";
    render(
      <UserProfileDialog
        isOpen
        onOpenChange={vi.fn()}
        selectedUser={buildUser({ role: "Super Admin", role_slug: "super_admin" })}
      />,
    );
    expect(screen.queryByRole("button", { name: /manage permissions/i })).not.toBeInTheDocument();
  });

  it("hides Manage Permissions for a store_owner target even when the viewer is super_admin", () => {
    viewerRole.current = "super_admin";
    render(
      <UserProfileDialog
        isOpen
        onOpenChange={vi.fn()}
        selectedUser={buildUser({ role: "Store Owner", role_slug: "store_owner" })}
      />,
    );
    expect(screen.queryByRole("button", { name: /manage permissions/i })).not.toBeInTheDocument();
  });

  it("hides Manage Permissions entirely when the viewer is not super_admin", () => {
    viewerRole.current = "agent";
    render(
      <UserProfileDialog
        isOpen
        onOpenChange={vi.fn()}
        selectedUser={buildUser({ role_slug: "platform_admin" })}
      />,
    );
    expect(screen.queryByRole("button", { name: /manage permissions/i })).not.toBeInTheDocument();
  });
});
