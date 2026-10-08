import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { DeleteUserDialog } from "@/components/admin/users/delete-user-dialog";
import { PurgeStoreDialog } from "@/components/admin/stores/store-delete-dialogs";
import { UserTable } from "@/components/admin/users/user-table";
import { useAdminAuthStore } from "@/lib/store/use-admin-auth-store";
import type { AdminStoreSummary, AdminUser } from "@/lib/types/admin";

vi.mock("sonner", () => ({ toast: { success: vi.fn(), error: vi.fn() } }));

const user = {
  id: "user-1",
  name: "Ada Owner",
  email: "ada@example.com",
  role: "Store Owner",
  role_slug: "store_owner",
  store: "Ada Pharmacy",
  status: "Active",
  lastActive: "2 hours ago",
  joinedAt: "Jan 01, 2026",
} as unknown as AdminUser;

const store: AdminStoreSummary = {
  id: "store-1",
  name: "Ada Pharmacy",
  owner: "Ada Owner",
  status: "Active",
} as unknown as AdminStoreSummary;

const noop = () => undefined;

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

describe("destructive action copy", () => {
  it("does not tell the admin that deleting a user is permanent", () => {
    render(
      <DeleteUserDialog
        isOpen
        onOpenChange={() => {}}
        selectedUser={user}
        setSelectedUser={() => {}}
        deleteMutation={{ mutate: vi.fn(), isPending: false } as never}
      />,
    );

    const body = document.body.textContent ?? "";
    expect(body).not.toMatch(/permanently/i);
    expect(body).not.toMatch(/irreversibl/i);
    expect(body).not.toMatch(/cannot be undone/i);
    expect(body).toMatch(/archiv/i);
  });

  it("tells the admin that purging a store can remove the owner account", () => {
    render(
      <PurgeStoreDialog
        store={store}
        onOpenChange={() => {}}
        onConfirm={() => {}}
        isPending={false}
      />,
    );

    const body = document.body.textContent ?? "";
    expect(body).toMatch(/owner/i);
    expect(body).toMatch(/cannot be undone/i);
  });
});

describe("row-level Delete control, gated by the server's can_delete flag", () => {
  it("hides Delete Account when the server marks the row undeletable", async () => {
    useAdminAuthStore.setState({
      user: { id: "actor-1", role: "super_admin" } as never,
    });

    render(
      <UserTable
        userList={[{ ...user, can_delete: false }]}
        {...userTableHandlers}
      />,
    );

    await userEvent.click(screen.getByRole("button", { name: "" }));
    expect(screen.queryByText("Delete Account")).not.toBeInTheDocument();
  });

  it("shows Delete Account when the server marks the row deletable", async () => {
    useAdminAuthStore.setState({
      user: { id: "actor-1", role: "super_admin" } as never,
    });

    render(
      <UserTable
        userList={[{ ...user, can_delete: true }]}
        {...userTableHandlers}
      />,
    );

    await userEvent.click(screen.getByRole("button", { name: "" }));
    expect(await screen.findByText("Delete Account")).toBeInTheDocument();
  });
});
