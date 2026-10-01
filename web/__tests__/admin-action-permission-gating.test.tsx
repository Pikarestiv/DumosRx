import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { StoreRowActions } from "@/components/admin/stores/store-row-actions";
import { UserTable } from "@/components/admin/users/user-table";
import { BroadcastsTab } from "@/components/admin/views/broadcasts-tab";
import type { AdminStoreSummary, AdminUser } from "@/lib/types/admin";
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

vi.mock("@tanstack/react-query", async () => {
  const actual = await vi.importActual<typeof import("@tanstack/react-query")>(
    "@tanstack/react-query",
  );
  return {
    ...actual,
    useQuery: () => ({ data: [], isLoading: false }),
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
});

describe("BroadcastsTab permission gating", () => {
  it("hides New Broadcast and the row action menu without send_notifications", () => {
    authState.user = { role: "platform_admin", effective_permissions: [] };
    render(<BroadcastsTab />);

    expect(screen.queryByText("New Broadcast")).not.toBeInTheDocument();
  });

  it("shows New Broadcast once send_notifications is granted", () => {
    authState.user = { role: "agent", effective_permissions: ["send_notifications"] };
    render(<BroadcastsTab />);

    expect(screen.getByText("New Broadcast")).toBeInTheDocument();
  });

  it("shows New Broadcast to super_admin regardless of effective_permissions", () => {
    authState.user = { role: "super_admin", effective_permissions: [] };
    render(<BroadcastsTab />);

    expect(screen.getByText("New Broadcast")).toBeInTheDocument();
  });
});
