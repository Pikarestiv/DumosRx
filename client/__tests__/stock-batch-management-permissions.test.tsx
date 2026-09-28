import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";

/**
 * Two Inventory keys convert a coarse role check into a specific one on
 * the Inventory Dashboard: "perform_stock_audit" replaces the isAdmin gate
 * on Start Audit (so a specialist - the stock-owning role, which already
 * holds the key by default - can run a cycle count), and
 * "view_stock_adjustment_history" replaces the canManageStockBatch gate on
 * the Movements tab (so a read-only auditor can read the ledger without
 * gaining any write right). The ledger route redirect moves with it, since
 * /inventory/ledger is directly reachable.
 */

const hasPermission = vi.fn((_key: string) => true);
const replace = vi.fn();
const prefetch = vi.fn();
const setIsAuditing = vi.fn();

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
  useInventoryAudit: () => ({ isAuditing: false, setIsAuditing }),
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

function deny(...denied: string[]) {
  hasPermission.mockImplementation((key: string) => !denied.includes(key));
}

describe("Inventory dashboard audit / movements permissions", () => {
  beforeEach(() => {
    hasPermission.mockReset();
    hasPermission.mockImplementation(() => true);
    replace.mockReset();
    prefetch.mockReset();
    setIsAuditing.mockReset();
  });

  it("checks both inventory keys", () => {
    render(<StockBatchManagement currentTab="overview" />);
    expect(hasPermission).toHaveBeenCalledWith("perform_stock_audit");
    expect(hasPermission).toHaveBeenCalledWith(
      "view_stock_adjustment_history",
    );
  });

  it("offers Start Audit and the Movements tab with both keys", () => {
    render(<StockBatchManagement currentTab="overview" />);
    expect(screen.queryByText("Start Audit")).not.toBeNull();
    expect(screen.queryByText("Movements")).not.toBeNull();
  });

  it("hides Start Audit without perform_stock_audit", () => {
    deny("perform_stock_audit");
    render(<StockBatchManagement currentTab="overview" />);
    expect(screen.queryByText("Start Audit")).toBeNull();
    expect(screen.queryByText("Movements")).not.toBeNull();
  });

  it("does not open the audit overlay on /inventory/audits without the key", () => {
    deny("perform_stock_audit");
    render(<StockBatchManagement currentTab="audits" />);
    expect(setIsAuditing).not.toHaveBeenCalled();
    expect(replace).toHaveBeenCalledWith("/inventory/overview");
  });

  it("opens the audit overlay on /inventory/audits with the key", () => {
    render(<StockBatchManagement currentTab="audits" />);
    expect(setIsAuditing).toHaveBeenCalledWith(true);
  });

  it("hides the Movements tab without view_stock_adjustment_history", () => {
    deny("view_stock_adjustment_history");
    render(<StockBatchManagement currentTab="overview" />);
    expect(screen.queryByText("Movements")).toBeNull();
    expect(screen.queryByText("Start Audit")).not.toBeNull();
  });

  it("redirects off /inventory/ledger without view_stock_adjustment_history", () => {
    deny("view_stock_adjustment_history");
    render(<StockBatchManagement currentTab="ledger" />);
    expect(replace).toHaveBeenCalledWith("/inventory/overview");
  });

  it("keeps the ledger reachable with view_stock_adjustment_history", () => {
    render(<StockBatchManagement currentTab="ledger" />);
    expect(replace).not.toHaveBeenCalled();
    expect(screen.queryByText("movements-panel")).not.toBeNull();
  });
});
