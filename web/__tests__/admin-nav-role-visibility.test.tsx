import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import {
  sidebarItems,
  visibleSidebarItems,
} from "@/components/admin/sidebar-items";

const agentUser = {
  role: "agent",
  first_name: "Ada",
  last_name: "Agent",
  email: "ada@dumosrx.com",
};

const { authState } = vi.hoisted(() => ({
  authState: {
    user: null as {
      role: string;
      first_name: string;
      last_name: string;
      email: string;
    } | null,
  },
}));

vi.mock("next/navigation", () => ({
  usePathname: () => "/admin",
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

vi.mock("@/lib/store/use-admin-store", () => ({
  useAdminStore: () => ({ latency: 0 }),
}));

vi.mock("@/lib/api/admin-hooks", () => ({
  useAdminSummary: () => ({ isLoading: false }),
}));

vi.mock("@/hooks/use-api-environment", () => ({
  useApiEnvironmentName: () => ({
    environmentName: "Local",
    isProduction: false,
  }),
}));

vi.mock("@/components/ui/server-selector", () => ({
  ServerSelector: () => null,
}));

vi.mock("@/components/admin/admin-header-search", () => ({
  AdminHeaderSearch: () => null,
}));

vi.mock("@/components/admin/admin-header-notifications", () => ({
  AdminHeaderNotifications: () => null,
}));

vi.mock("@/components/admin/admin-header-refresh", () => ({
  AdminHeaderRefresh: () => null,
}));

vi.mock("@/components/mode-toggle", () => ({
  ModeToggle: () => null,
}));

const { AdminHeader } = await import("@/components/admin/admin-header");
const { AdminSidebar } = await import("@/components/admin/admin-sidebar");

const superAdminOnlyNames = () =>
  sidebarItems
    .filter((item) => !(item.roles ?? ["super_admin"]).includes("agent"))
    .map((item) => item.name);

describe("visibleSidebarItems", () => {
  it("hides super_admin-only items from agents and platform admins", () => {
    for (const role of ["agent", "platform_admin"]) {
      const ids = visibleSidebarItems({ role, effective_permissions: [] }).map(
        (item) => item.id,
      );
      expect(ids).toContain("referrals");
      expect(ids).not.toContain("settings");
      expect(ids).not.toContain("stores");
      expect(ids).not.toContain("users");
    }
  });

  /** Registering a store is reached from Stores, not from its own nav item. */
  it("has no standalone register-store shortcut for any role", () => {
    for (const role of ["super_admin", "platform_admin", "agent"]) {
      const ids = visibleSidebarItems({ role, effective_permissions: [] }).map((item) => item.id);
      expect(ids).not.toContain("register-store");
    }

    expect(visibleSidebarItems({ role: "super_admin" }).map((i) => i.id)).toContain("settings");
  });

  it("returns nothing for an unknown or missing role", () => {
    expect(visibleSidebarItems(undefined)).toEqual([]);
    expect(visibleSidebarItems({ role: "store_owner" })).toEqual([]);
  });
});

describe("admin navigation role filtering", () => {
  beforeEach(() => {
    authState.user = agentUser;
  });

  it("filters the mobile sheet nav the same way the desktop sidebar does", async () => {
    render(<AdminHeader />);
    await userEvent.click(
      screen.getByRole("button", { name: /open navigation menu/i }),
    );

    for (const name of superAdminOnlyNames()) {
      expect(screen.queryByRole("link", { name })).toBeNull();
    }
    expect(screen.getByRole("link", { name: "My Stores" })).toBeTruthy();
  });

  it("filters the desktop sidebar for an agent", () => {
    render(<AdminSidebar />);
    for (const name of superAdminOnlyNames()) {
      expect(screen.queryByRole("link", { name })).toBeNull();
    }
    expect(screen.getByRole("link", { name: "My Stores" })).toBeTruthy();
  });

  it("points the logo at the first item the role can load, not at /admin", () => {
    const { container } = render(<AdminSidebar />);
    const logo = container.querySelector("#tour-brand");
    expect(logo?.getAttribute("href")).toBe(
      visibleSidebarItems(agentUser)[0].href,
    );
    expect(logo?.getAttribute("href")).not.toBe("/admin");
  });

  it("keeps the logo on /admin for a super_admin", () => {
    authState.user = { ...agentUser, role: "super_admin" };
    const { container } = render(<AdminSidebar />);
    expect(container.querySelector("#tour-brand")?.getAttribute("href")).toBe(
      "/admin",
    );
  });

  /** The admin layout clips the sidebar at screen height, so if the item list
   * is not its own scroll area it pushes the profile/sign-out block out of
   * view entirely and Sign Out becomes unreachable. */
  it("scrolls the desktop nav items rather than pushing the sign-out block off-screen", () => {
    const { container } = render(<AdminSidebar />);

    const nav = container.querySelector("nav");
    if (!nav) throw new Error("expected the sidebar to render a nav");
    expect(nav.className).toContain("overflow-y-auto");
    expect(nav.className).toContain("min-h-0");

    const signOut = screen.getByRole("button", { name: /sign out/i });
    expect(nav.contains(signOut)).toBe(false);
  });
});
