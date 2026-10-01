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
      expect(ids).toContain("register-store");
      expect(ids).toContain("referrals");
      expect(ids).not.toContain("settings");
      expect(ids).not.toContain("stores");
      expect(ids).not.toContain("users");
    }
  });

  it("hides the agent-only registration shortcut from super_admin", () => {
    const ids = visibleSidebarItems({ role: "super_admin" }).map(
      (item) => item.id,
    );
    expect(ids).not.toContain("register-store");
    expect(ids).toContain("settings");
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
    expect(screen.getByRole("link", { name: "Register Store" })).toBeTruthy();
  });

  it("filters the desktop sidebar for an agent", () => {
    render(<AdminSidebar />);
    for (const name of superAdminOnlyNames()) {
      expect(screen.queryByRole("link", { name })).toBeNull();
    }
    expect(screen.getByRole("link", { name: "Register Store" })).toBeTruthy();
  });
});
