import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, within } from "@testing-library/react";

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
  Element.prototype.hasPointerCapture = Element.prototype.hasPointerCapture ?? (() => false);
  Element.prototype.scrollIntoView = Element.prototype.scrollIntoView ?? (() => {});
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

  it("submits only the permission the operator actually changed, never the untouched rows", async () => {
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

    const trigger = screen.getByRole("combobox", { name: "Store Impersonation override" });
    fireEvent.click(trigger);
    const listbox = await screen.findByRole("listbox");
    fireEvent.click(within(listbox).getByText("Granted"));

    fireEvent.click(screen.getByRole("button", { name: "Save Changes" }));

    expect(mockMutateAsync).toHaveBeenCalledTimes(1);
    expect(mockMutateAsync).toHaveBeenCalledWith({
      id: "u1",
      overrides: { impersonate_store: true },
    });
  });

  it("sends no request at all when nothing was touched", () => {
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

    fireEvent.click(screen.getByRole("button", { name: "Save Changes" }));
    expect(mockMutateAsync).not.toHaveBeenCalled();
  });
});
