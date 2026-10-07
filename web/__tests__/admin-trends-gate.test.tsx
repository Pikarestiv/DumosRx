import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";
import { visibleSidebarItems } from "@/components/admin/sidebar-items";

const { authState, trendsHook } = vi.hoisted(() => ({
  authState: {
    user: null as { role: string; effective_permissions?: string[] } | null,
  },
  trendsHook: vi.fn(() => ({ data: undefined, isLoading: false })),
}));

vi.mock("next/navigation", () => ({
  usePathname: () => "/admin/trends",
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

vi.mock("@/lib/api/admin-hooks-trends", () => ({
  TREND_WINDOWS: ["30d", "6m", "12m"],
  TREND_WINDOW_LABELS: { "30d": "30 days", "6m": "6 months", "12m": "12 months" },
  useAdminTrends: trendsHook,
}));

const { default: TrendsPage } = await import("@/app/admin/trends/page");

describe("Trends access", () => {
  beforeEach(() => {
    authState.user = null;
    trendsHook.mockClear();
  });

  it("is absent from the nav for every non-super_admin role", () => {
    for (const permissions of [["manage_platform"], ["manage_platform", "view_platform_data"]]) {
      expect(
        visibleSidebarItems({ role: "custom_role", effective_permissions: permissions }).map((i) => i.id),
      ).not.toContain("trends");
    }

    expect(
      visibleSidebarItems({ role: "platform_admin", effective_permissions: [] }).map((i) => i.id),
    ).not.toContain("trends");
    expect(
      visibleSidebarItems({ role: "agent", effective_permissions: [] }).map((i) => i.id),
    ).not.toContain("trends");
  });

  it("is in the nav for super_admin", () => {
    expect(
      visibleSidebarItems({ role: "super_admin", effective_permissions: [] }).map((i) => i.id),
    ).toContain("trends");
  });

  /** A refused role must not even reach the endpoint. */
  it("shows a deep-linking non-super_admin an explanation and fetches nothing", () => {
    authState.user = {
      role: "platform_admin",
      effective_permissions: ["manage_platform", "view_platform_data"],
    };

    render(<TrendsPage />);

    expect(screen.getByText(/only available to super admins/i)).toBeDefined();
    expect(trendsHook).not.toHaveBeenCalled();
  });

  it("renders the trends content for super_admin", () => {
    authState.user = { role: "super_admin", effective_permissions: [] };

    render(<TrendsPage />);

    expect(screen.queryByText(/only available to super admins/i)).toBeNull();
    expect(trendsHook).toHaveBeenCalled();
  });
});
