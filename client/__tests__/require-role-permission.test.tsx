import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";

/**
 * RequireRole is the ONLY enforcement point for the procurement routes in
 * this local-first app - hiding a tab or a header button is not a gate
 * when the URL is typeable. Its new `permission` prop narrows the coarse
 * (isAdmin || canManageStockBatch) baseline to a specific key, so
 * /procurement/new and /procurement/edit now require
 * "manage_purchase_orders" and /procurement/vendors requires
 * "view_suppliers", without widening the baseline for anyone.
 */

const hasPermission = vi.fn((_key: string) => true);
const replace = vi.fn();

vi.mock("@/lib/hooks/use-permissions", () => ({
  useHasPermission: (key: string) => hasPermission(key),
}));
vi.mock("next/navigation", () => ({ useRouter: () => ({ replace }) }));
vi.mock("sonner", () => ({ toast: { error: vi.fn() } }));

const auth = {
  isAdmin: false,
  canManageStockBatch: true,
  user: { role: "specialist" },
  isAuthenticated: true,
};
vi.mock("@/lib/context/auth-context", () => ({ useAuth: () => auth }));

import { RequireRole } from "@/components/auth/require-role";

describe("RequireRole permission prop", () => {
  beforeEach(() => {
    hasPermission.mockReset();
    hasPermission.mockImplementation(() => true);
    replace.mockReset();
    auth.canManageStockBatch = true;
  });

  it("renders without a permission prop, as before", () => {
    render(
      <RequireRole>
        <div>procurement</div>
      </RequireRole>,
    );
    expect(screen.queryByText("procurement")).not.toBeNull();
  });

  it("renders when the required permission is held", () => {
    render(
      <RequireRole permission="manage_purchase_orders">
        <div>create-order</div>
      </RequireRole>,
    );
    expect(hasPermission).toHaveBeenCalledWith("manage_purchase_orders");
    expect(screen.queryByText("create-order")).not.toBeNull();
  });

  it("redirects a role-baseline account that lacks the key", () => {
    hasPermission.mockImplementation(
      (key: string) => key !== "manage_purchase_orders",
    );
    render(
      <RequireRole permission="manage_purchase_orders">
        <div>create-order</div>
      </RequireRole>,
    );
    expect(screen.queryByText("create-order")).toBeNull();
    expect(replace).toHaveBeenCalledWith("/dashboard");
  });

  it("redirects on view_suppliers too", () => {
    hasPermission.mockImplementation((key: string) => key !== "view_suppliers");
    render(
      <RequireRole permission="view_suppliers">
        <div>vendors</div>
      </RequireRole>,
    );
    expect(screen.queryByText("vendors")).toBeNull();
    expect(replace).toHaveBeenCalledWith("/dashboard");
  });

  it("still blocks an account failing the coarse baseline even with the key", () => {
    auth.canManageStockBatch = false;
    render(
      <RequireRole permission="manage_purchase_orders">
        <div>create-order</div>
      </RequireRole>,
    );
    expect(screen.queryByText("create-order")).toBeNull();
  });
});
