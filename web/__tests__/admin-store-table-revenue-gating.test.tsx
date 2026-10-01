import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import { StoreTable } from "@/components/admin/stores/store-table";
import type { AdminStoreSummary } from "@/lib/types/admin";

const { authState } = vi.hoisted(() => ({
  authState: {
    user: null as { role: string } | null,
  },
}));

vi.mock("@/lib/store/use-admin-auth-store", () => ({
  useAdminAuthStore: () => ({ user: authState.user }),
  checkIsSuperAdmin: (role?: string) => role === "super_admin",
  checkHasPermission: () => false,
}));

/**
 * A-139: GET /admin/stores strips `revenue` for a non-super_admin caller,
 * so the Total Revenue column previously rendered an em-dash for every row
 * instead of being hidden — reading as "no revenue data" rather than "you
 * are not shown this."
 */
describe("StoreTable revenue column gating", () => {
  const store: AdminStoreSummary = {
    id: "store-1",
    name: "Test Store",
    owner: "Jane Owner",
    plan: "Pro",
    status: "Active",
    date: "2 days ago",
    stores: 1,
  } as AdminStoreSummary;

  const noop = () => {};
  const actions = {
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

  it("hides the Total Revenue column for a delegated admin", () => {
    authState.user = { role: "agent" };
    render(
      <StoreTable
        storeList={[store]}
        isLoading={false}
        pendingStoreId={null}
        router={{ push: noop } as never}
        {...actions}
      />,
    );

    expect(screen.queryByText("Total Revenue")).not.toBeInTheDocument();
  });

  it("shows the Total Revenue column for a super_admin", () => {
    authState.user = { role: "super_admin" };
    render(
      <StoreTable
        storeList={[store]}
        isLoading={false}
        pendingStoreId={null}
        router={{ push: noop } as never}
        {...actions}
      />,
    );

    expect(screen.getByText("Total Revenue")).toBeInTheDocument();
  });
});
