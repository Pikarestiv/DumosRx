import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";

const { mockUpdateMutateAsync, mockToastError, roleRows } = vi.hoisted(() => ({
  mockUpdateMutateAsync: vi.fn().mockResolvedValue(undefined),
  mockToastError: vi.fn(),
  roleRows: {
    current: [
      { id: 1, name: "Platform Admin", slug: "platform_admin", is_system: true, permissions: ["view_platform_data"], user_count: 2 },
      { id: 2, name: "Agent", slug: "agent", is_system: true, permissions: ["view_platform_data"], user_count: 1 },
    ] as Record<string, unknown>[],
  },
}));

vi.mock("sonner", () => ({
  toast: { success: vi.fn(), error: mockToastError },
}));

vi.mock("@/lib/api/admin-hooks-roles", () => ({
  useAdminRoles: () => ({ data: { roles: roleRows.current }, isLoading: false }),
  useUpdateRolePermissionsMutation: () => ({ mutateAsync: mockUpdateMutateAsync, isPending: false }),
  useCreateRoleMutation: () => ({ mutateAsync: vi.fn(), isPending: false }),
  useDeleteRoleMutation: () => ({ mutateAsync: vi.fn(), isPending: false }),
}));

import { AdminPermissionsCard } from "@/components/admin/views/admin-permissions-card";

const BUILT_IN_ROWS = [
  { id: 1, name: "Platform Admin", slug: "platform_admin", is_system: true, permissions: ["view_platform_data"], user_count: 2 },
  { id: 2, name: "Agent", slug: "agent", is_system: true, permissions: ["view_platform_data"], user_count: 1 },
];

beforeEach(() => {
  mockUpdateMutateAsync.mockClear();
  mockToastError.mockClear();
  roleRows.current = [...BUILT_IN_ROWS];
});

describe("AdminPermissionsCard custom-role deletion", () => {
  it("disables the delete action while admins still hold the role", () => {
    roleRows.current = [
      ...BUILT_IN_ROWS,
      { id: 3, name: "Support Lead", slug: "support_lead", is_system: false, permissions: [], user_count: 3 },
    ];
    render(<AdminPermissionsCard />);

    expect(screen.getByRole("button", { name: /delete support lead/i })).toBeDisabled();
  });

  it("never promises that deleting will leave admins without the role", () => {
    roleRows.current = [
      ...BUILT_IN_ROWS,
      { id: 4, name: "Billing Lead", slug: "billing_lead", is_system: false, permissions: [], user_count: 0 },
    ];
    render(<AdminPermissionsCard />);

    const trigger = screen.getByRole("button", { name: /delete billing lead/i });
    expect(trigger).not.toBeDisabled();
    fireEvent.click(trigger);

    expect(screen.queryByText(/without it/i)).not.toBeInTheDocument();
    expect(screen.getByText(/permanently removes/i)).toBeInTheDocument();
  });
});

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

  it("A-137: toggling a cell stages the change instead of writing it through immediately", () => {
    render(<AdminPermissionsCard />);

    const agentSendNotifications = screen.getByRole("checkbox", {
      name: /send notifications for agent/i,
    });
    fireEvent.click(agentSendNotifications);

    expect(mockUpdateMutateAsync).not.toHaveBeenCalled();
    expect(screen.getByText(/unsaved permission changes/i)).toBeInTheDocument();
    expect(agentSendNotifications).toBeChecked();
  });

  it("A-137: Save changes commits the role's full updated permission list", async () => {
    render(<AdminPermissionsCard />);

    fireEvent.click(screen.getByRole("checkbox", { name: /send notifications for agent/i }));
    fireEvent.click(screen.getByRole("button", { name: /save changes/i }));

    await Promise.resolve();

    expect(mockUpdateMutateAsync).toHaveBeenCalledTimes(1);
    expect(mockUpdateMutateAsync).toHaveBeenCalledWith({
      slug: "agent",
      permissions: ["view_platform_data", "send_notifications"],
    });
  });

  it("A-137: Discard reverts a staged change without ever calling the mutation", () => {
    render(<AdminPermissionsCard />);

    const checkbox = screen.getByRole("checkbox", { name: /send notifications for agent/i });
    fireEvent.click(checkbox);
    fireEvent.click(screen.getByRole("button", { name: /discard/i }));

    expect(mockUpdateMutateAsync).not.toHaveBeenCalled();
    expect(screen.queryByText(/unsaved permission changes/i)).not.toBeInTheDocument();
    expect(checkbox).not.toBeChecked();
  });

  /**
   * Code-review finding on A-137: a role staged for a change could be
   * deleted (by another admin/tab) before Save ran; the loop's `if
   * (!role) continue;` skipped it without recording a failure, so the UI
   * reported success and cleared the staged edit with no warning and no
   * mutation ever sent for it.
   */
  it("warns and keeps the edit staged when its role is deleted before Save runs, instead of silently discarding it", async () => {
    const { rerender } = render(<AdminPermissionsCard />);

    fireEvent.click(screen.getByRole("checkbox", { name: /send notifications for agent/i }));

    // Simulate the role disappearing (deleted elsewhere) before Save.
    roleRows.current = BUILT_IN_ROWS.filter((role) => role.slug !== "agent");
    rerender(<AdminPermissionsCard />);

    fireEvent.click(screen.getByRole("button", { name: /save changes/i }));

    await waitFor(() => {
      expect(mockToastError).toHaveBeenCalledWith(expect.stringMatching(/failed to save/i));
    });

    expect(mockUpdateMutateAsync).not.toHaveBeenCalled();
    // The edit must still be reported as unsaved, not silently cleared.
    expect(screen.getByText(/unsaved permission changes/i)).toBeInTheDocument();
  });
});
