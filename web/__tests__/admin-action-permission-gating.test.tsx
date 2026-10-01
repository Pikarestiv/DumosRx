import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { StoreRowActions } from "@/components/admin/stores/store-row-actions";
import { StoreTable } from "@/components/admin/stores/store-table";
import { UserTable } from "@/components/admin/users/user-table";
import { BroadcastsTab } from "@/components/admin/views/broadcasts-tab";
import type { AdminBroadcast, AdminStoreSummary, AdminUser } from "@/lib/types/admin";
import type { AppRouterInstance } from "next/dist/shared/lib/app-router-context.shared-runtime";

const { authState } = vi.hoisted(() => ({
  authState: {
    user: null as { role: string; effective_permissions?: string[] } | null,
  },
}));

vi.mock("@/lib/store/use-admin-auth-store", () => ({
  useAdminAuthStore: () => ({ user: authState.user }),
  checkIsSuperAdmin: (role?: string) => role === "super_admin",
  checkHasPermission: (
    user: { role?: string; effective_permissions?: string[] } | null | undefined,
    permission: string,
  ) => {
    if (!user) return false;
    if (user.role === "super_admin") return true;
    return (user.effective_permissions ?? []).includes(permission);
  },
}));

const mockBroadcast: AdminBroadcast = {
  id: "broadcast-1",
  title: "Scheduled Maintenance",
  message: "The platform will be briefly unavailable tonight.",
  type: "info",
  target_type: "all",
  is_active: true,
};

vi.mock("@tanstack/react-query", async () => {
  const actual = await vi.importActual<typeof import("@tanstack/react-query")>(
    "@tanstack/react-query",
  );
  return {
    ...actual,
    useQuery: () => ({ data: [mockBroadcast], isLoading: false }),
    useQueryClient: () => ({ invalidateQueries: vi.fn() }),
  };
});

vi.mock("@/lib/api/admin-hooks", () => ({
  useDeleteBroadcastMutation: () => ({ mutate: vi.fn() }),
}));

vi.mock("@/lib/api/client", () => ({
  webApiClient: {
    adminGetBroadcasts: vi.fn(),
    createBroadcast: vi.fn(),
    updateBroadcast: vi.fn(),
    toggleBroadcast: vi.fn(),
  },
}));

const store: AdminStoreSummary = {
  id: "8f1b2c3d-4e5f-6071-8293-a4b5c6d7e8f9",
  name: "Gated Test Store",
  owner: "Ada Owner",
  email: "ada@dumosrx.com",
  plan: "free",
  status: "Active",
  date: "Jan 02, 2026",
};

const noop = () => undefined;

const rowActionHandlers = {
  handleImpersonate: noop,
  handleViewBilling: noop,
  setSelectedStore: noop,
  setIsSuspendDialogOpen: noop,
  setIsTrialDialogOpen: noop,
  setIsActivatePlanDialogOpen: noop,
  handleUnsuspend: noop,
  handleToggleDemo: noop,
  handleArchive: noop,
  handleRestore: noop,
  handlePurge: noop,
};

describe("StoreRowActions permission gating", () => {
  const renderActions = (canImpersonate: boolean, canManageAccountStatus: boolean) =>
    render(
      <StoreRowActions
        store={store}
        isSuperAdmin={false}
        canGrantTrials={false}
        canImpersonate={canImpersonate}
        canManageAccountStatus={canManageAccountStatus}
        pendingStoreId={null}
        router={{ push: vi.fn() } as unknown as AppRouterInstance}
        {...rowActionHandlers}
      />,
    );

  const openMenu = async () => {
    await userEvent.click(screen.getByRole("button", { name: /actions for/i }));
    await screen.findByText("View Store Details");
  };

  it("hides Impersonate and Suspend from a platform_admin/agent lacking both permissions", async () => {
    renderActions(false, false);
    await openMenu();

    expect(screen.queryByText("Impersonate (Admin)")).not.toBeInTheDocument();
    expect(screen.queryByText("Suspend Account")).not.toBeInTheDocument();
  });

  it("hides View Billing History from a non-super_admin, whose route is super_admin-only", async () => {
    renderActions(true, true);
    await openMenu();

    expect(screen.queryByText("View Billing History")).not.toBeInTheDocument();
  });

  it("shows Impersonate to a role holding impersonate_store", async () => {
    renderActions(true, false);
    await openMenu();

    expect(screen.getByText("Impersonate (Admin)")).toBeInTheDocument();
    expect(screen.queryByText("Suspend Account")).not.toBeInTheDocument();
  });

  it("shows Suspend to a role holding manage_account_status", async () => {
    renderActions(false, true);
    await openMenu();

    expect(screen.queryByText("Impersonate (Admin)")).not.toBeInTheDocument();
    expect(screen.getByText("Suspend Account")).toBeInTheDocument();
  });
});

describe("StoreTable real permission-slug mapping", () => {
  const renderTable = () =>
    render(
      <StoreTable
        storeList={[store]}
        isLoading={false}
        pendingStoreId={null}
        router={{ push: vi.fn() } as unknown as AppRouterInstance}
        {...rowActionHandlers}
      />,
    );

  const openMenu = async () => {
    await userEvent.click(screen.getByRole("button", { name: /actions for/i }));
    await screen.findByText("View Store Details");
  };

  it("hides Impersonate and Suspend for a platform_admin holding neither permission", async () => {
    authState.user = { role: "platform_admin", effective_permissions: [] };
    renderTable();
    await openMenu();

    expect(screen.queryByText("Impersonate (Admin)")).not.toBeInTheDocument();
    expect(screen.queryByText("Suspend Account")).not.toBeInTheDocument();
  });

  it("shows Impersonate and Suspend for a platform_admin holding both permissions", async () => {
    authState.user = {
      role: "platform_admin",
      effective_permissions: ["impersonate_store", "manage_account_status"],
    };
    renderTable();
    await openMenu();

    expect(screen.getByText("Impersonate (Admin)")).toBeInTheDocument();
    expect(screen.getByText("Suspend Account")).toBeInTheDocument();
  });

  it("hides Grant Trial from a platform_admin whose grant_trials was revoked", async () => {
    authState.user = { role: "platform_admin", effective_permissions: ["impersonate_store"] };
    renderTable();
    await openMenu();

    expect(screen.queryByText("Grant Trial")).not.toBeInTheDocument();
  });

  it("shows Grant Trial to an agent granted grant_trials", async () => {
    authState.user = { role: "agent", effective_permissions: ["grant_trials"] };
    renderTable();
    await openMenu();

    expect(screen.getByText("Grant Trial")).toBeInTheDocument();
  });

  it("shows Impersonate and Suspend for a super_admin regardless of effective_permissions", async () => {
    authState.user = { role: "super_admin", effective_permissions: [] };
    renderTable();
    await openMenu();

    expect(screen.getByText("Impersonate (Admin)")).toBeInTheDocument();
    expect(screen.getByText("Suspend Account")).toBeInTheDocument();
    expect(screen.getByText("View Billing History")).toBeInTheDocument();
  });
});

const user: AdminUser = {
  id: "user-1",
  name: "Test User",
  email: "test@dumosrx.com",
  role: "Store Owner",
  role_slug: "store_owner",
  status: "Active",
};

const userTableHandlers = {
  isLoading: false,
  error: null,
  refetch: noop,
  setSelectedUser: noop,
  setIsProfileDialogOpen: noop,
  setIsNotifyDialogOpen: noop,
  setIsResetDialogOpen: noop,
  setIsDeactivateDialogOpen: noop,
  setIsReactivateDialogOpen: noop,
  setIsDeleteDialogOpen: noop,
  setIsTrialDialogOpen: noop,
  setIsActivatePlanDialogOpen: noop,
};

describe("UserTable permission gating", () => {
  const openMenu = async () => {
    await userEvent.click(screen.getByRole("button"));
    await screen.findByText("View Detailed Profile");
  };

  it("hides notify, reset-password and deactivate for a platform_admin/agent with no grants", async () => {
    authState.user = { role: "platform_admin", effective_permissions: [] };
    render(<UserTable userList={[user]} {...userTableHandlers} />);
    await openMenu();

    expect(screen.queryByText("Send Notification")).not.toBeInTheDocument();
    expect(screen.queryByText("Force Password Reset")).not.toBeInTheDocument();
    expect(screen.queryByText("Deactivate Account")).not.toBeInTheDocument();
  });

  it("shows each action once its matching permission is granted", async () => {
    authState.user = {
      role: "agent",
      effective_permissions: ["send_notifications", "reset_user_passwords", "manage_account_status"],
    };
    render(<UserTable userList={[user]} {...userTableHandlers} />);
    await openMenu();

    expect(screen.getByText("Send Notification")).toBeInTheDocument();
    expect(screen.getByText("Force Password Reset")).toBeInTheDocument();
    expect(screen.getByText("Deactivate Account")).toBeInTheDocument();
  });

  it("shows every gated action to a super_admin regardless of effective_permissions", async () => {
    authState.user = { role: "super_admin", effective_permissions: [] };
    render(<UserTable userList={[user]} {...userTableHandlers} />);
    await openMenu();

    expect(screen.getByText("Send Notification")).toBeInTheDocument();
    expect(screen.getByText("Force Password Reset")).toBeInTheDocument();
    expect(screen.getByText("Deactivate Account")).toBeInTheDocument();
  });

  it("hides Delete Account from a delegated admin holding every delegatable permission", async () => {
    authState.user = {
      role: "platform_admin",
      effective_permissions: [
        "view_platform_data",
        "send_notifications",
        "reset_user_passwords",
        "manage_account_status",
        "impersonate_store",
        "grant_trials",
      ],
    };
    render(<UserTable userList={[user]} {...userTableHandlers} />);
    await openMenu();

    expect(screen.queryByText("Delete Account")).not.toBeInTheDocument();
  });

  it("shows Delete Account to a super_admin", async () => {
    authState.user = { role: "super_admin", effective_permissions: [] };
    render(<UserTable userList={[user]} {...userTableHandlers} />);
    await openMenu();

    expect(screen.getByText("Delete Account")).toBeInTheDocument();
  });

  it("hides Grant Free Trial and Activate Paid Plan from a viewer without grant_trials", async () => {
    authState.user = { role: "platform_admin", effective_permissions: [] };
    render(<UserTable userList={[user]} {...userTableHandlers} />);
    await openMenu();

    expect(screen.queryByText("Grant Free Trial")).not.toBeInTheDocument();
    expect(screen.queryByText("Activate Paid Plan")).not.toBeInTheDocument();
  });

  it("shows Grant Free Trial and Activate Paid Plan once the viewer holds grant_trials", async () => {
    authState.user = { role: "agent", effective_permissions: ["grant_trials"] };
    render(<UserTable userList={[user]} {...userTableHandlers} />);
    await openMenu();

    expect(screen.getByText("Grant Free Trial")).toBeInTheDocument();
    expect(screen.getByText("Activate Paid Plan")).toBeInTheDocument();
  });

  it("still hides the trial actions for a target account that cannot hold a plan", async () => {
    authState.user = { role: "super_admin", effective_permissions: [] };
    render(
      <UserTable
        userList={[{ ...user, role_slug: "cashier" }]}
        {...userTableHandlers}
      />,
    );
    await openMenu();

    expect(screen.queryByText("Grant Free Trial")).not.toBeInTheDocument();
  });
});

describe("BroadcastsTab permission gating", () => {
  it("hides New Broadcast and the per-row action menu without send_notifications", () => {
    authState.user = { role: "platform_admin", effective_permissions: [] };
    render(<BroadcastsTab />);

    expect(screen.queryByText("New Broadcast")).not.toBeInTheDocument();
    expect(screen.getByText(mockBroadcast.title)).toBeInTheDocument();
    expect(screen.queryByText("Edit Broadcast")).not.toBeInTheDocument();
  });

  it("shows New Broadcast and the per-row action menu once send_notifications is granted", async () => {
    authState.user = { role: "agent", effective_permissions: ["send_notifications"] };
    render(<BroadcastsTab />);

    expect(screen.getByText("New Broadcast")).toBeInTheDocument();

    const rowMenuTrigger = screen.getByRole("button", { name: "" });
    await userEvent.click(rowMenuTrigger);

    expect(await screen.findByText("Edit Broadcast")).toBeInTheDocument();
    expect(screen.getByText("Delete Permanent")).toBeInTheDocument();
  });

  it("shows New Broadcast and the per-row action menu to super_admin regardless of effective_permissions", async () => {
    authState.user = { role: "super_admin", effective_permissions: [] };
    render(<BroadcastsTab />);

    expect(screen.getByText("New Broadcast")).toBeInTheDocument();

    const rowMenuTrigger = screen.getByRole("button", { name: "" });
    await userEvent.click(rowMenuTrigger);

    expect(await screen.findByText("Edit Broadcast")).toBeInTheDocument();
  });
});
