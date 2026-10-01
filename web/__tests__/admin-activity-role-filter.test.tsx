import { describe, it, expect, vi, beforeAll } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import ActivityPage from "@/app/admin/activity/page";

beforeAll(() => {
  Element.prototype.hasPointerCapture = Element.prototype.hasPointerCapture || (() => false);
  Element.prototype.setPointerCapture = Element.prototype.setPointerCapture || (() => {});
  Element.prototype.releasePointerCapture = Element.prototype.releasePointerCapture || (() => {});
  Element.prototype.scrollIntoView = Element.prototype.scrollIntoView || (() => {});
});

const mockUseAdminActivityLogs = vi.fn((..._args: unknown[]) => ({
  data: { data: [], meta: undefined },
  isLoading: false,
  error: null,
  refetch: vi.fn(),
}));

vi.mock("@/lib/api/admin-activity-hooks", () => ({
  useAdminActivityLogs: (...args: unknown[]) => mockUseAdminActivityLogs(...args),
}));

vi.mock("@/lib/api/admin-hooks-stores", () => ({
  useAdminStores: () => ({ data: { data: [] }, isLoading: false }),
}));

vi.mock("@/lib/api/admin-hooks-users", () => ({
  useAdminUsers: () => ({ data: { data: [] }, isLoading: false }),
}));

const { mockUseAdminRoles, viewerRole } = vi.hoisted(() => ({
  mockUseAdminRoles: vi.fn(),
  viewerRole: { current: "super_admin" },
}));

vi.mock("@/lib/store/use-admin-auth-store", () => ({
  useAdminAuthStore: (selector?: (state: { user: { role: string } | null }) => unknown) => {
    const state = { user: { role: viewerRole.current } };
    return selector ? selector(state) : state;
  },
  checkIsSuperAdmin: (role?: string) => role === "super_admin",
}));

vi.mock("@/lib/api/admin-hooks-roles", () => ({
  useAdminRoles: (enabled?: boolean) => (mockUseAdminRoles(enabled), {
    data: {
      roles: [
        { id: 1, name: "Super Admin", slug: "super_admin", is_system: true, permissions: [], user_count: 1 },
        { id: 2, name: "Regional Lead", slug: "regional_lead", is_system: false, permissions: [], user_count: 2 },
      ],
    },
    isLoading: false,
  }),
}));

vi.mock("next/navigation", () => ({
  useSearchParams: () => new URLSearchParams(),
}));

const selectAgentRole = async (user: ReturnType<typeof userEvent.setup>) => {
  await user.click(screen.getByRole("button", { name: /all roles/i }));
  await user.click(await screen.findByText("Agent"));
};

describe("Activity page actor-role filter", () => {
  it("never fires the super_admin-only roles request for a delegated admin", () => {
    viewerRole.current = "platform_admin";
    mockUseAdminRoles.mockClear();
    render(<ActivityPage />);

    expect(mockUseAdminRoles).toHaveBeenCalledWith(false);
    viewerRole.current = "super_admin";
  });

  it("fires the roles request for a super_admin viewer", () => {
    viewerRole.current = "super_admin";
    mockUseAdminRoles.mockClear();
    render(<ActivityPage />);

    expect(mockUseAdminRoles).toHaveBeenCalledWith(true);
  });

  it("passes the selected role through to useAdminActivityLogs as the final argument", async () => {
    const user = userEvent.setup();
    render(<ActivityPage />);

    await selectAgentRole(user);

    expect(mockUseAdminActivityLogs).toHaveBeenLastCalledWith(
      expect.anything(),
      expect.anything(),
      expect.anything(),
      expect.anything(),
      expect.anything(),
      expect.anything(),
      expect.anything(),
      "agent",
    );
  });

  it("shows the selected role as the dropdown's label", async () => {
    const user = userEvent.setup();
    render(<ActivityPage />);

    await selectAgentRole(user);

    expect(screen.getByRole("button", { name: "Agent" })).toBeInTheDocument();
  });

  it("includes a custom platform role from useAdminRoles alongside the 3 built-ins", async () => {
    const user = userEvent.setup();
    render(<ActivityPage />);

    await user.click(screen.getByRole("button", { name: /all roles/i }));
    await user.click(await screen.findByText("Regional Lead"));

    expect(mockUseAdminActivityLogs).toHaveBeenLastCalledWith(
      expect.anything(),
      expect.anything(),
      expect.anything(),
      expect.anything(),
      expect.anything(),
      expect.anything(),
      expect.anything(),
      "regional_lead",
    );
  });

  it("does not duplicate a built-in role slug already covered by useAdminRoles", async () => {
    const user = userEvent.setup();
    render(<ActivityPage />);

    await user.click(screen.getByRole("button", { name: /all roles/i }));

    expect(screen.getAllByText("Super Admin")).toHaveLength(1);
  });

  it("clears the role filter along with the other filters", async () => {
    const user = userEvent.setup();
    render(<ActivityPage />);

    await selectAgentRole(user);
    await user.click(screen.getByRole("button", { name: /clear/i }));

    expect(mockUseAdminActivityLogs).toHaveBeenLastCalledWith(
      expect.anything(),
      expect.anything(),
      expect.anything(),
      expect.anything(),
      expect.anything(),
      expect.anything(),
      expect.anything(),
      "",
    );
  });
});
