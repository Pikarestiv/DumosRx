import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import GlobalUsersDirectory from "@/app/admin/users/page";

const renderPage = () => {
  const queryClient = new QueryClient();
  return render(
    <QueryClientProvider client={queryClient}>
      <GlobalUsersDirectory />
    </QueryClientProvider>,
  );
};

const { authState } = vi.hoisted(() => ({
  authState: {
    user: null as { role: string; effective_permissions?: string[] } | null,
  },
}));

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn() }),
  useSearchParams: () => null,
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

vi.mock("@/lib/api/admin-hooks", () => ({
  useAdminUsers: () => ({
    data: { data: [], meta: { total: 0, last_page: 1 } },
    isLoading: false,
    error: null,
    refetch: vi.fn(),
  }),
  useDeactivateUserMutation: () => ({ mutate: vi.fn() }),
  useResetUserPasswordMutation: () => ({ mutate: vi.fn() }),
  useNotifyUserMutation: () => ({ mutate: vi.fn() }),
  useBulkNotifyUsersMutation: () => ({ mutate: vi.fn() }),
  useDeleteUserMutation: () => ({ mutate: vi.fn() }),
  useReactivateUserMutation: () => ({ mutate: vi.fn() }),
  useGrantUserTrialMutation: () => ({ mutate: vi.fn(), isPending: false }),
  useActivateUserPlanMutation: () => ({ mutate: vi.fn(), isPending: false }),
}));

describe("Global Users Directory - Notify All gating", () => {
  it("hides Notify All from a platform_admin/agent without send_notifications", () => {
    authState.user = { role: "platform_admin", effective_permissions: [] };
    renderPage();

    expect(screen.queryByTitle("Notify All Filtered")).not.toBeInTheDocument();
  });

  it("shows Notify All once send_notifications is granted", () => {
    authState.user = { role: "agent", effective_permissions: ["send_notifications"] };
    renderPage();

    expect(screen.getByTitle("Notify All Filtered")).toBeInTheDocument();
  });

  it("shows Notify All to super_admin regardless of effective_permissions", () => {
    authState.user = { role: "super_admin", effective_permissions: [] };
    renderPage();

    expect(screen.getByTitle("Notify All Filtered")).toBeInTheDocument();
  });
});
