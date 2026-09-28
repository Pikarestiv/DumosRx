import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import type { StaffListItem } from "@/lib/types/user";

vi.mock("@/lib/context/auth-context", () => ({
  useAuth: () => ({ isAdmin: true }),
  checkIsAdmin: (role?: string) => role === "admin" || role === "store_owner",
}));

vi.mock("sonner", () => ({
  toast: { error: vi.fn(), success: vi.fn() },
}));

import { StaffList } from "@/components/settings/staff/staff-list";

function staff(overrides: Partial<StaffListItem> = {}): StaffListItem {
  return {
    id: "u1",
    first_name: "Ada",
    last_name: "Obi",
    username: "ada",
    role: "sales_staff",
    store_id: "store-a",
    is_active: 1,
    created_at: "2026-01-01T00:00:00.000Z",
    has_pin: 1,
    ...overrides,
  };
}

function renderList(users: StaffListItem[]) {
  render(
    <StaffList
      users={users}
      isLoading={false}
      onEdit={vi.fn()}
      onDelete={vi.fn()}
      onReactivate={vi.fn()}
    />,
  );
}

/**
 * U8: "delete staff" is really a reversible deactivation (the confirm dialog
 * says so), but the row used a red trash icon and a "Delete X" label, which
 * made admins avoid a safe action.
 * U9: the "PIN set" pill was rendered unconditionally.
 */
describe("StaffList row affordances", () => {
  it("labels the deactivate action as deactivation, not deletion", () => {
    renderList([staff()]);

    expect(screen.queryAllByLabelText(/^Delete /)).toHaveLength(0);
    expect(screen.getAllByLabelText("Deactivate ada").length).toBeGreaterThan(0);
  });

  it("only claims a PIN is set when the row says so", () => {
    renderList([staff({ has_pin: 1 })]);
    expect(screen.getAllByText("PIN set").length).toBeGreaterThan(0);
    expect(screen.queryAllByText("No PIN")).toHaveLength(0);
  });

  it("says so when an account has no PIN yet", () => {
    renderList([staff({ has_pin: 0 })]);
    expect(screen.getAllByText("No PIN").length).toBeGreaterThan(0);
    expect(screen.queryAllByText("PIN set")).toHaveLength(0);
  });

  it("does not claim a PIN is set when the query didn't report one", () => {
    renderList([staff({ has_pin: undefined })]);
    expect(screen.queryAllByText("PIN set")).toHaveLength(0);
  });

  it("offers reactivation, not deactivation, for an inactive account", () => {
    renderList([staff({ is_active: 0 })]);
    expect(screen.getAllByLabelText("Reactivate ada").length).toBeGreaterThan(0);
    expect(screen.queryAllByLabelText("Deactivate ada")).toHaveLength(0);
  });
});
