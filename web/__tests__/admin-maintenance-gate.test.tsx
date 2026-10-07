import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";
import { visibleSidebarItems } from "@/components/admin/sidebar-items";

const { authState, statusHook } = vi.hoisted(() => ({
  authState: {
    user: null as { role: string; effective_permissions?: string[] } | null,
  },
  statusHook: vi.fn(() => ({ data: undefined, isLoading: false })),
}));

vi.mock("next/navigation", () => ({
  usePathname: () => "/admin/maintenance",
  useRouter: () => ({ push: vi.fn() }),
}));

vi.mock("next/link", () => ({
  default: ({ children }: { children: React.ReactNode }) => <a href="#">{children}</a>,
}));

vi.mock("@/lib/store/use-admin-auth-store", () => ({
  useAdminAuthStore: () => ({ user: authState.user, logout: vi.fn() }),
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

vi.mock("@/lib/api/admin-hooks-maintenance", () => ({
  MIGRATION_STATUS_KEY: "admin-migration-status",
  useAdminMigrationStatus: statusHook,
  useRunMigrationsMutation: () => ({ mutate: vi.fn(), isPending: false, data: undefined }),
  useSyncRolesMutation: () => ({ mutate: vi.fn(), isPending: false, data: undefined }),
}));

const { default: MaintenancePage } = await import("@/app/admin/maintenance/page");

describe("Maintenance access", () => {
  beforeEach(() => {
    authState.user = null;
    statusHook.mockClear();
  });

  it("is absent from the nav for every non-super_admin role", () => {
    for (const permissions of [["manage_platform"], ["manage_platform", "view_platform_data"]]) {
      expect(
        visibleSidebarItems({ role: "custom_role", effective_permissions: permissions }).map((i) => i.id),
      ).not.toContain("maintenance");
    }

    expect(
      visibleSidebarItems({ role: "platform_admin", effective_permissions: [] }).map((i) => i.id),
    ).not.toContain("maintenance");
    expect(
      visibleSidebarItems({ role: "agent", effective_permissions: [] }).map((i) => i.id),
    ).not.toContain("maintenance");
  });

  it("is in the nav for super_admin", () => {
    expect(
      visibleSidebarItems({ role: "super_admin", effective_permissions: [] }).map((i) => i.id),
    ).toContain("maintenance");
  });

  /**
   * The page guard, and the property that matters most about it: a refused
   * role must issue NO request. Running migrations is the panel's most
   * consequential surface, so a deep link from a colleague must not even
   * reach the status endpoint.
   */
  it("shows a deep-linking non-super_admin an explanation and fetches nothing", () => {
    authState.user = {
      role: "platform_admin",
      effective_permissions: ["manage_platform", "view_platform_data"],
    };

    render(<MaintenancePage />);

    expect(screen.getByText(/only available to super admins/i)).toBeDefined();
    expect(statusHook).not.toHaveBeenCalled();
  });

  it("renders the maintenance content for super_admin", () => {
    authState.user = { role: "super_admin", effective_permissions: [] };

    render(<MaintenancePage />);

    expect(screen.queryByText(/only available to super admins/i)).toBeNull();
    expect(statusHook).toHaveBeenCalled();
  });
});
