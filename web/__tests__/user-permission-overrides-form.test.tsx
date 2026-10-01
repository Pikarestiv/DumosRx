import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";

const { mockMutateAsync } = vi.hoisted(() => ({
  mockMutateAsync: vi.fn().mockResolvedValue(undefined),
}));

vi.mock("@/lib/api/admin-hooks-roles", () => ({
  useUpdateUserPermissionOverridesMutation: () => ({
    mutateAsync: mockMutateAsync,
    isPending: false,
  }),
}));

import { UserPermissionOverridesForm } from "@/components/admin/users/user-permission-overrides-form";

beforeEach(() => {
  mockMutateAsync.mockClear();
});

describe("UserPermissionOverridesForm", () => {
  it("renders a 3-state control per catalog permission for a platform_admin target", () => {
    render(
      <UserPermissionOverridesForm
        user={{
          id: "u1",
          name: "Pat Admin",
          email: "pat@dumosrx.com",
          role: "Platform Admin",
          role_slug: "platform_admin",
          status: "Active",
          effective_permissions: ["view_platform_data"],
        }}
      />,
    );

    expect(screen.getByText("View Platform Data")).toBeInTheDocument();
    expect(screen.getByText("Store Impersonation")).toBeInTheDocument();

    const selects = screen.getAllByRole("combobox");
    expect(selects).toHaveLength(5);
  });

  it("defaults a permission present in effective_permissions to Granted and everything else to Inherited", () => {
    render(
      <UserPermissionOverridesForm
        user={{
          id: "u1",
          name: "Pat Admin",
          email: "pat@dumosrx.com",
          role: "Platform Admin",
          role_slug: "platform_admin",
          status: "Active",
          effective_permissions: ["view_platform_data"],
        }}
      />,
    );

    expect(screen.getByRole("combobox", { name: "View Platform Data override" })).toHaveTextContent(
      "Granted",
    );
    expect(
      screen.getByRole("combobox", { name: "Store Impersonation override" }),
    ).toHaveTextContent("Inherited");
  });
});
