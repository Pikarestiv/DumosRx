import { describe, it, expect, vi, beforeEach } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { AppRouterInstance } from "next/dist/shared/lib/app-router-context.shared-runtime";
import { UserTable } from "@/components/admin/users/user-table";
import { useAdminAuthStore } from "@/lib/store/use-admin-auth-store";
import type { AdminUser } from "@/lib/types/admin";

const push = vi.fn();
const noop = vi.fn();

const person: AdminUser = {
  id: "u-123",
  name: "Ada Admin",
  email: "ada@dumosrx.com",
  role: "Platform Admin",
  role_slug: "platform_admin",
  status: "Active",
};

const renderTable = () =>
  render(
    <UserTable
      userList={[person]}
      isLoading={false}
      error={null}
      refetch={noop}
      setSelectedUser={noop}
      router={{ push } as unknown as AppRouterInstance}
      setIsNotifyDialogOpen={noop}
      setIsResetDialogOpen={noop}
      setIsDeactivateDialogOpen={noop}
      setIsReactivateDialogOpen={noop}
      setIsDeleteDialogOpen={noop}
      setIsTrialDialogOpen={noop}
      setIsActivatePlanDialogOpen={noop}
    />,
  );

describe("Users list opens a page for the person", () => {
  beforeEach(() => {
    push.mockReset();
    useAdminAuthStore.setState({
      user: { id: "v1", first_name: "Vi", last_name: "Ewer", email: "v@dumosrx.com", role: "super_admin" },
    });
  });

  it("opens the detail page when the row is clicked", async () => {
    renderTable();

    await userEvent.click(screen.getByText("ada@dumosrx.com", { exact: false }));

    expect(push).toHaveBeenCalledWith("/admin/users/details/?id=u-123");
  });

  it("opens the same page from the name link", async () => {
    renderTable();

    await userEvent.click(screen.getByRole("link", { name: "Ada Admin" }));

    expect(push).toHaveBeenCalledTimes(1);
    expect(push).toHaveBeenCalledWith("/admin/users/details/?id=u-123");
  });

  it("opens the page from View Detailed Profile in the actions menu, once", async () => {
    renderTable();

    await userEvent.click(screen.getByRole("button"));
    await userEvent.click(await screen.findByRole("menuitem", { name: /view detailed profile/i }));

    expect(push).toHaveBeenCalledTimes(1);
    expect(push).toHaveBeenCalledWith("/admin/users/details/?id=u-123");
  });

  it("does not navigate just because the actions menu was opened", async () => {
    renderTable();

    await userEvent.click(screen.getByRole("button"));
    await screen.findByRole("menuitem", { name: /view detailed profile/i });

    expect(push).not.toHaveBeenCalled();
  });

  it("leaves Ctrl-click on the name to the browser, so it can open in a new tab", () => {
    renderTable();

    const notCancelled = fireEvent.click(screen.getByRole("link", { name: "Ada Admin" }), { ctrlKey: true });

    expect(notCancelled).toBe(true);
    expect(push).not.toHaveBeenCalled();
  });
});
