import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";

vi.mock("@/lib/api/admin-hooks-roles", () => ({
  useAdminRoles: () => ({
    data: {
      roles: [
        { id: 1, name: "Platform Admin", slug: "platform_admin", is_system: true, permissions: ["view_platform_data"], user_count: 2 },
        { id: 2, name: "Agent", slug: "agent", is_system: true, permissions: ["view_platform_data"], user_count: 1 },
      ],
    },
    isLoading: false,
  }),
  useUpdateRolePermissionsMutation: () => ({ mutateAsync: vi.fn(), isPending: false }),
  useCreateRoleMutation: () => ({ mutateAsync: vi.fn(), isPending: false }),
  useDeleteRoleMutation: () => ({ mutateAsync: vi.fn(), isPending: false }),
}));

import { AdminPermissionsCard } from "@/components/admin/views/admin-permissions-card";

describe("AdminPermissionsCard", () => {
  it("renders one row per catalog permission and one column per role", () => {
    render(<AdminPermissionsCard />);
    expect(screen.getByText("View Platform Data")).toBeInTheDocument();
    expect(screen.getByText("Send Notifications")).toBeInTheDocument();
    expect(screen.getByText("Reset Passwords")).toBeInTheDocument();
    expect(screen.getByText("Manage Account Status")).toBeInTheDocument();
    expect(screen.getByText("Store Impersonation")).toBeInTheDocument();
    expect(screen.getByText("Platform Admin")).toBeInTheDocument();
    expect(screen.getByText("Agent")).toBeInTheDocument();
  });

  it("does not show a delete action for a system role", () => {
    render(<AdminPermissionsCard />);
    expect(screen.queryByRole("button", { name: /delete platform admin/i })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /delete agent/i })).not.toBeInTheDocument();
  });
});
