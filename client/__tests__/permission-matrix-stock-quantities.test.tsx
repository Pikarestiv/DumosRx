import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";

vi.mock("@/lib/hooks/use-permission-groups", () => ({
  usePermissionGroups: () => ({
    groups: [
      { id: "g1", name: "Stock Lead", based_on_role: "manager", is_default: false, permissions: ["adjust_stock_counts"] },
      { id: "g2", name: "Cashier", based_on_role: "sales_staff", is_default: true, permissions: ["process_sales"] },
      {
        id: "g3",
        name: "Manager",
        based_on_role: "manager",
        is_default: true,
        permissions: ["view_reports", "view_stock_quantities"],
      },
    ],
    toggle: vi.fn(),
    toggleMany: vi.fn(),
    createGroup: vi.fn(),
    copyGroup: vi.fn(),
    revertToDefault: vi.fn(),
    renameGroup: vi.fn(),
    deleteGroup: vi.fn(),
  }),
}));

vi.mock("@/lib/hooks/use-permissions", () => ({
  useHasPermission: () => true,
  useOwnGrantScope: () => ({ unrestricted: true, ownPermissions: [] }),
  useOwnPermissionGroupId: () => null,
}));

vi.mock("@/lib/hooks/use-feature-gate", () => ({
  useFeatureGate: () => ({
    canCreateCustomPermissionGroups: true,
    withRestriction: (fn: (...args: unknown[]) => void) => fn,
  }),
}));

import { PermissionMatrix } from "@/components/settings/roles-permissions/permission-matrix";

describe("PermissionMatrix and view_stock_quantities", () => {
  it("lists the key as live, not coming soon, with its explanation", () => {
    render(<PermissionMatrix />);
    const row = screen.getByText("View Stock Quantities").closest('[role="row"]');
    expect(row).not.toBeNull();
    expect(row?.querySelector('[data-testid="not-yet-enforced"]')).toBeNull();
    const info = screen.getByRole("button", { name: /About View Stock Quantities/ });
    expect(info.getAttribute("aria-label")).toMatch(/does not encrypt the till's data/);
  });

  it("warns only for a group that lacks the key but can still reach quantity screens", () => {
    render(<PermissionMatrix />);
    expect(screen.queryByRole("button", { name: /Stock Lead still sees stock quantities/ })).not.toBeNull();
    expect(screen.queryByRole("button", { name: /Cashier still sees stock quantities/ })).toBeNull();
    expect(screen.queryByRole("button", { name: /Manager still sees stock quantities/ })).toBeNull();
  });
});
