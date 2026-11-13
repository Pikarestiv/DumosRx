import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { AuditItem } from "@/components/stock-batch/stock-audits";

vi.mock("@tanstack/react-virtual", () => ({
  useVirtualizer: ({ count, estimateSize }: { count: number; estimateSize: () => number }) => ({
    getVirtualItems: () =>
      Array.from({ length: count }, (_, index) => ({
        key: index,
        index,
        start: index * estimateSize(),
        size: estimateSize(),
      })),
    getTotalSize: () => count * estimateSize(),
    measureElement: () => {},
  }),
}));
vi.mock("@/lib/context/store-context", () => ({
  useStore: () => ({ storeProfile: { id: "store-1", name: "Test Pharmacy" } }),
}));
vi.mock("@/lib/context/auth-context", () => ({ useAuth: () => ({ user: { id: "u1" } }) }));
vi.mock("@/lib/hooks/use-permissions", () => ({ useHasPermission: () => true }));
vi.mock("@/lib/db/sync-engine", () => ({ sync: vi.fn().mockResolvedValue(undefined) }));
vi.mock("@/lib/db/queries/products", () => ({
  getProductsWithDetails: vi.fn().mockResolvedValue([]),
}));
vi.mock("@/lib/db/queries/inventory", () => ({
  getProductStockQuantity: vi.fn().mockResolvedValue(0),
}));
vi.mock("@/lib/hooks/use-stock-audit-mutation", () => ({
  useSubmitStockAuditMutation: () => ({ mutate: vi.fn(), isPending: false }),
}));
vi.mock("@/lib/hooks/use-count-freshness", () => ({
  useCountFreshness: () => ({ shouldWarn: false }),
}));
vi.mock("@/lib/utils/device-id", () => ({ getDeviceId: () => "TILL-A" }));
vi.mock("@/lib/db/DatabaseProvider", () => ({
  useDatabase: () => ({ isReady: true, isOffline: false, isTauriApp: false, isReadOnlyTab: true, error: null }),
}));
vi.mock("@/lib/api/client", () => ({
  apiClient: { getBaseURL: () => "https://api.test/api/v1" },
}));

import { StockAudits } from "@/components/stock-batch/stock-audits";
import { useStockAuditDraftStore } from "@/lib/hooks/use-stock-audit-draft";

const draft: AuditItem[] = [
  { id: "a", name: "Amoxil", sku: "A-1", category: "c", systemQty: 9, countedQty: 7, counted: true },
  { id: "b", name: "Flagyl", sku: "F-1", category: "c", systemQty: 4 },
];

describe("cycle count in a tab that cannot save", () => {
  const posts: string[] = [];

  beforeEach(() => {
    posts.length = 0;
    localStorage.clear();
    global.fetch = vi.fn((url: string, init?: RequestInit) => {
      if (init?.method === "POST") posts.push(url);
      const session = {
        id: "S1",
        store_id: "store-1",
        status: "in_progress",
        active_till_id: "TILL-A",
        lease_version: 1,
        submitted_stock_audit_id: null,
        items: [],
      };
      return Promise.resolve({ ok: true, status: 200, json: () => Promise.resolve({ success: true, session }) } as Response);
    }) as unknown as typeof fetch;
    useStockAuditDraftStore.setState({ items: draft, activeStoreId: null, loadedStoreId: null });
  });

  it("offers no way to enter a count that would be lost, or to start the count over", async () => {
    render(
      <QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>
        <StockAudits onClose={vi.fn()} />
      </QueryClientProvider>,
    );
    await waitFor(() =>
      expect(vi.mocked(global.fetch).mock.calls.some(([u]) => String(u).includes("/active"))).toBe(true),
    );

    expect(screen.queryAllByRole("spinbutton", { name: /Counted quantity for/ })).toEqual([]);
    for (const box of screen.getAllByRole("checkbox", { name: /Mark .* as counted/ })) {
      expect(box.hasAttribute("disabled")).toBe(true);
    }

    fireEvent.pointerDown(screen.getByRole("button", { name: /more export options/i }));
    expect(screen.queryByRole("menuitem", { name: /Start over/ })).toBeNull();
  });
});
