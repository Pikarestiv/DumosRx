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

vi.mock("next/navigation", () => ({
  useSearchParams: () => new URLSearchParams(),
}));

const selectAgentRole = async (user: ReturnType<typeof userEvent.setup>) => {
  await user.click(screen.getByRole("button", { name: /all roles/i }));
  await user.click(await screen.findByText("Agent"));
};

describe("Activity page actor-role filter", () => {
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
