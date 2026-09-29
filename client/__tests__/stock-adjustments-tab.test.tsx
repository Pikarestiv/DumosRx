import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";
import {
  getPageInfo,
  resolveHeaderAction,
} from "@/lib/constants/dashboard-page-routes";
import { generateStaticParams } from "@/app/(dashboard)/inventory/[tab]/page";

/**
 * The Adjustments tab reuses the Inventory tab conventions wholesale: read
 * access is the existing view_stock_adjustment_history key (same key the
 * Movements tab uses), the write action is adjust_stock_counts, and the
 * header's "Adjust Stock" button just navigates to ?action=create for the
 * page's own effect to pick up.
 */

const hasPermission = vi.fn((_key: string) => true);
const replace = vi.fn();
const prefetch = vi.fn();

vi.mock("@/lib/hooks/use-permissions", () => ({
  useHasPermission: (key: string) => hasPermission(key),
}));
vi.mock("next/navigation", () => ({
  useRouter: () => ({ replace, prefetch, push: vi.fn() }),
  redirect: vi.fn(),
}));
vi.mock("@/lib/context/auth-context", () => ({
  useAuth: () => ({ isAdmin: false, canManageStockBatch: false }),
}));
vi.mock("@/lib/hooks/use-stock-batch-stats", () => ({
  useStockBatchStats: () => ({
    loading: false,
    totalStockBatchValue: 0,
    totalProducts: 0,
    lowStockCount: 0,
    expiringSoonCount: 0,
    activeCategories: 0,
  }),
}));
vi.mock("@/lib/context/inventory-audit-context", () => ({
  useInventoryAudit: () => ({ isAuditing: false, setIsAuditing: vi.fn() }),
}));
vi.mock("@/lib/context/store-context", () => ({
  useStore: () => ({ storeProfile: { currency: "NGN" } }),
}));
vi.mock("@/components/stock-batch/stock-batch-metrics", () => ({
  StockBatchMetrics: () => <div>metrics-panel</div>,
}));
vi.mock("@/components/stock-batch/stock-overview", () => ({
  StockOverview: () => <div>overview-panel</div>,
}));
vi.mock("@/components/stock-batch/stock-movements", () => ({
  StockMovements: () => <div>movements-panel</div>,
}));
vi.mock("@/components/stock-batch/stock-adjustments-ledger", () => ({
  StockAdjustmentsLedger: () => <div>adjustments-panel</div>,
}));
vi.mock("@/components/products/product-database", () => ({
  ProductDatabase: () => <div>catalog-panel</div>,
}));

import { StockBatchManagement } from "@/components/stock-batch/stock-batch-management";

describe("Adjustments tab", () => {
  beforeEach(() => {
    hasPermission.mockReset();
    hasPermission.mockImplementation(() => true);
    replace.mockReset();
    prefetch.mockReset();
  });

  it("is a real inventory route", async () => {
    const params = await generateStaticParams();
    expect(params.map((p) => p.tab)).toContain("adjustments");
  });

  it("shows the tab and its panel to a viewer with view_stock_adjustment_history", () => {
    render(<StockBatchManagement currentTab="adjustments" />);
    expect(screen.getByRole("tab", { name: /adjustments/i })).toBeTruthy();
    expect(screen.getByText("adjustments-panel")).toBeTruthy();
  });

  it("hides the tab without view_stock_adjustment_history", () => {
    hasPermission.mockImplementation((key) => key !== "view_stock_adjustment_history");
    render(<StockBatchManagement currentTab="overview" />);
    expect(screen.queryByRole("tab", { name: /adjustments/i })).toBeNull();
  });

  it("bounces a direct visit to the route without that permission", () => {
    hasPermission.mockImplementation((key) => key !== "view_stock_adjustment_history");
    render(<StockBatchManagement currentTab="adjustments" />);
    expect(replace).toHaveBeenCalledWith("/inventory/overview");
  });
});

describe("Adjust Stock header action", () => {
  function resolve(granted: string[]) {
    return resolveHeaderAction(
      "/inventory/adjustments",
      getPageInfo("/inventory/adjustments"),
      true,
      true,
      true,
      false,
      (key: string) => granted.includes(key),
    );
  }

  it("titles the page", () => {
    expect(getPageInfo("/inventory/adjustments")?.title).toBe("Stock Adjustments");
  });

  it("offers Adjust Stock to an account holding adjust_stock_counts", () => {
    const action = resolve(["adjust_stock_counts"]);
    expect(action?.label).toBe("Adjust Stock");
    expect(action?.path).toBe("/inventory/adjustments?action=create");
  });

  it("withholds it from an account without adjust_stock_counts", () => {
    expect(resolve([])).toBeNull();
  });
});
