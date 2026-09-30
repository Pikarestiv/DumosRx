import { describe, it, expect, beforeEach, vi } from "vitest";
import { render, screen } from "@testing-library/react";

/**
 * Regression coverage for FIXED_BUGS.md A-45: DashboardHeader passes
 * resolveHeaderAction a permission-check closure, and that closure used to
 * recognise only three hardcoded keys and return true for anything else.
 * Every other route's `actionPermission` - adjust_stock_counts on Adjust
 * Stock, manage_customers, record_expenses - was therefore declared but
 * never enforced. The closure now delegates to the same hasPermission()
 * every other call site uses, so it enforces whatever key a route declares.
 */

if (!window.matchMedia) {
  window.matchMedia = ((query: string) => ({
    matches: true,
    media: query,
    onchange: null,
    addEventListener: () => {},
    removeEventListener: () => {},
    addListener: () => {},
    removeListener: () => {},
    dispatchEvent: () => false,
  })) as unknown as typeof window.matchMedia;
}

let pathname = "/inventory/adjustments";
let permissions: string[] = [];
let role = "manager";

vi.mock("next/navigation", () => ({
  usePathname: () => pathname,
  useRouter: () => ({ push: vi.fn(), replace: vi.fn(), prefetch: vi.fn() }),
}));

// canManageStockBatch is auth-context's own hasPermission("manage_products")
// call, so the mock derives it the same way rather than hardcoding true -
// the "has adjust_stock_counts but not manage_products" case below depends
// on the two coming apart.
vi.mock("@/lib/context/auth-context", () => ({
  useAuth: () => ({
    user: { id: "u1", first_name: "Ada", role },
    canManageStockBatch: role === "store_owner" || permissions.includes("manage_products"),
    isAdmin: false,
    permissionGroup: { id: "g1", permissions },
  }),
}));

vi.mock("@/lib/context/store-context", () => ({
  useStore: () => ({
    storeProfile: { id: "s1", name: "Store A" },
    availableStores: [],
    activeStoreId: "s1",
    switchStore: vi.fn(),
  }),
}));

vi.mock("@/lib/context/inventory-audit-context", () => ({
  useInventoryAudit: () => ({ setIsAuditing: vi.fn() }),
}));

vi.mock("@/lib/hooks/use-feature-gate", () => ({
  useFeatureGate: () => ({ canManageMultiStore: false }),
}));

vi.mock("@/hooks/use-media-query", () => ({
  useMediaQuery: () => true,
}));

vi.mock("@/components/dashboard/sync-indicator", () => ({
  SyncIndicator: () => null,
}));
vi.mock("@/components/dashboard/notification-bell", () => ({
  NotificationBell: () => null,
}));
vi.mock("@/components/dashboard/user-nav", () => ({ UserNav: () => null }));
vi.mock("@/components/dashboard/user-profile-badge", () => ({
  UserProfileBadge: () => null,
}));
vi.mock("@/components/dashboard/live-clock", () => ({ LiveClock: () => null }));
vi.mock("@/components/dashboard/header-store-switcher", () => ({
  HeaderStoreSwitcher: () => null,
}));

import { DashboardHeader } from "@/components/dashboard/dashboard-header";
import { TooltipProvider } from "@/components/ui/tooltip";

// The header's AssistantLauncher is tooltip-wrapped, and Radix requires a
// TooltipProvider ancestor - app/layout.tsx supplies the real one.
function renderHeader() {
  return render(
    <TooltipProvider>
      <DashboardHeader />
    </TooltipProvider>,
  );
}

describe("DashboardHeader enforces a route's actionPermission", () => {
  beforeEach(() => {
    pathname = "/inventory/adjustments";
    permissions = [];
    role = "manager";
  });

  it("hides Adjust Stock from a user without adjust_stock_counts", () => {
    permissions = ["view_stock_adjustment_history"];
    renderHeader();
    expect(screen.queryByRole("button", { name: /Adjust Stock/i })).toBeNull();
  });

  it("shows Adjust Stock to a user with adjust_stock_counts", () => {
    permissions = ["adjust_stock_counts", "manage_products"];
    renderHeader();
    expect(screen.getAllByRole("button", { name: /Adjust Stock/i }).length).toBeGreaterThan(0);
  });

  it("reaches Adjust Stock with adjust_stock_counts alone, without manage_products", () => {
    permissions = ["adjust_stock_counts"];
    renderHeader();
    expect(screen.getAllByRole("button", { name: /Adjust Stock/i }).length).toBeGreaterThan(0);
  });

  it("still enforces the keys it already recognised", () => {
    pathname = "/procurement";
    permissions = ["manage_products"];
    renderHeader();
    expect(screen.queryByRole("button", { name: /Create Order/i })).toBeNull();
  });

  it("enforces manage_customers, which it previously allowed by default", () => {
    pathname = "/customers";
    permissions = ["manage_products"];
    renderHeader();
    expect(screen.queryByRole("button", { name: /Add Customer/i })).toBeNull();
  });

  it("never locks a store owner out of their own header action", () => {
    role = "store_owner";
    permissions = [];
    renderHeader();
    expect(screen.getAllByRole("button", { name: /Adjust Stock/i }).length).toBeGreaterThan(0);
  });
});
