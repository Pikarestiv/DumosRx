import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { visibleSidebarItems } from "@/components/admin/sidebar-items";

const withQueryClient = (ui: React.ReactElement) =>
  render(
    <QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>
      {ui}
    </QueryClientProvider>,
  );

const { authState, bucketHook, lifecycleHook } = vi.hoisted(() => ({
  authState: {
    user: null as
      | { role: string; first_name: string; last_name: string; email: string; effective_permissions?: string[] }
      | null,
  },
  bucketHook: vi.fn(() => ({ data: undefined, isLoading: false })),
  lifecycleHook: vi.fn(() => ({ data: undefined, isLoading: false })),
}));

vi.mock("next/navigation", () => ({
  usePathname: () => "/admin/subscriptions",
  useRouter: () => ({ push: vi.fn() }),
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

vi.mock("@/lib/api/admin-hooks-subscriptions", () => ({
  useAdminSubscriptionLifecycle: lifecycleHook,
  useAdminSubscriptionBucket: bucketHook,
  SUBSCRIPTION_WINDOWS: [7, 14, 30],
}));

// This test pins the gate, not the mutation plumbing.
vi.mock("@/lib/api/admin-hooks-users", () => ({
  useGrantUserTrialMutation: () => ({ mutate: vi.fn(), isPending: false }),
  useActivateUserPlanMutation: () => ({ mutate: vi.fn(), isPending: false }),
  useNotifyUserMutation: () => ({ mutate: vi.fn(), isPending: false }),
}));

const { default: SubscriptionsPage } = await import("@/app/admin/subscriptions/page");

describe("Subscriptions access", () => {
  beforeEach(() => {
    authState.user = null;
    bucketHook.mockClear();
    lifecycleHook.mockClear();
  });

  it("is absent from the nav for every non-super_admin role", () => {
    for (const permissions of [["manage_platform"], ["manage_platform", "view_platform_data"]]) {
      const ids = visibleSidebarItems({ role: "custom_role", effective_permissions: permissions }).map(
        (i) => i.id,
      );
      expect(ids).not.toContain("subscriptions");
    }

    expect(
      visibleSidebarItems({ role: "platform_admin", effective_permissions: [] }).map((i) => i.id),
    ).not.toContain("subscriptions");
    expect(
      visibleSidebarItems({ role: "agent", effective_permissions: [] }).map((i) => i.id),
    ).not.toContain("subscriptions");
  });

  it("is in the nav for super_admin", () => {
    expect(
      visibleSidebarItems({ role: "super_admin", effective_permissions: [] }).map((i) => i.id),
    ).toContain("subscriptions");
  });

  /**
   * PG-15 written as a test. admin/layout.tsx admits anyone with
   * manage_platform, so without a page guard a deep link renders a generic
   * "failed to load" and the colleague files a bug about an outage.
   */
  it("shows a deep-linking non-super_admin an explanation, not an error screen", () => {
    authState.user = {
      role: "platform_admin",
      first_name: "P",
      last_name: "A",
      email: "p@a.com",
      effective_permissions: ["manage_platform", "view_platform_data"],
    };

    render(<SubscriptionsPage />);

    expect(screen.getByText(/only available to super admins/i)).toBeDefined();
    expect(screen.queryByText(/failed to load/i)).toBeNull();
    expect(screen.queryByText(/retry/i)).toBeNull();
  });

  it("issues no request at all for a refused role", () => {
    authState.user = {
      role: "agent",
      first_name: "A",
      last_name: "G",
      email: "a@g.com",
      effective_permissions: ["manage_platform"],
    };

    render(<SubscriptionsPage />);

    expect(lifecycleHook).not.toHaveBeenCalled();
    expect(bucketHook).not.toHaveBeenCalled();
  });

  it("renders the worklists for super_admin", () => {
    authState.user = {
      role: "super_admin",
      first_name: "S",
      last_name: "A",
      email: "s@a.com",
    };

    withQueryClient(<SubscriptionsPage />);

    expect(screen.queryByText(/only available to super admins/i)).toBeNull();
    expect(screen.getAllByText(/subscriptions/i).length).toBeGreaterThan(0);
  });
});
