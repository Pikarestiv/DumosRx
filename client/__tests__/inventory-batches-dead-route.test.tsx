import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";

/**
 * /inventory/batches is in generateStaticParams but
 * stock-batch-management.tsx renders no <TabsContent> for it, so the route
 * resolved to a blank panel. Three things pointed at it — the Stock
 * Inventory header action ("Add Batch", ?action=add, which nothing handles),
 * the Needs Attention card and an action-centre alert — so the fix belongs
 * on the route, not on any one caller: it redirects to the Catalog tab, the
 * all-products view those callers actually meant.
 */

const hasPermission = vi.fn((_key: string) => true);
const replace = vi.fn();
const prefetch = vi.fn();

vi.mock("@/lib/hooks/use-permissions", () => ({
  useHasPermission: (key: string) => hasPermission(key),
}));
vi.mock("next/navigation", () => ({
  useRouter: () => ({ replace, prefetch, push: vi.fn() }),
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
vi.mock("@/components/products/product-database", () => ({
  ProductDatabase: () => <div>catalog-panel</div>,
}));

import { StockBatchManagement } from "@/components/stock-batch/stock-batch-management";
import { PAGE_ROUTES } from "@/lib/constants/dashboard-page-routes";

describe("the dead /inventory/batches route", () => {
  beforeEach(() => {
    hasPermission.mockReset();
    hasPermission.mockImplementation(() => true);
    replace.mockReset();
    prefetch.mockReset();
  });

  it("redirects to the catalog tab instead of rendering nothing", () => {
    render(<StockBatchManagement currentTab="batches" />);
    expect(replace).toHaveBeenCalledWith("/inventory/catalog");
  });

  it("leaves the tabs that do render alone", () => {
    render(<StockBatchManagement currentTab="overview" />);
    expect(replace).not.toHaveBeenCalled();
    expect(screen.queryByText("overview-panel")).not.toBeNull();
  });

  it("no longer offers an Add Batch header action pointing at the dead route", () => {
    const labels = PAGE_ROUTES.flatMap((route) =>
      [route.action?.label, route.secondaryAction?.label, route.fallbackAction?.label].filter(
        Boolean,
      ),
    );
    expect(labels).not.toContain("Add Batch");
  });

  it("has no page-route entry left pointing at /inventory/batches", () => {
    const paths = PAGE_ROUTES.flatMap((route) => [
      route.path,
      route.action?.path,
      route.secondaryAction?.path,
      route.fallbackAction?.path,
    ]);
    for (const path of paths) {
      expect(path ?? "").not.toContain("/inventory/batches");
    }
  });
});
