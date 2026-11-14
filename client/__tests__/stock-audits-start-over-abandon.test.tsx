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
vi.mock("@/lib/db/sync-engine", () => ({ sync: vi.fn().mockResolvedValue({ success: true }), isSyncing: () => false, SYNC_IN_PROGRESS_ERROR: "Sync already in progress" }));
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
vi.mock("@/lib/api/client", () => ({
  apiClient: { getBaseURL: () => "https://api.test/api/v1" },
}));

import { StockAudits } from "@/components/stock-batch/stock-audits";
import { useStockAuditDraftStore } from "@/lib/hooks/use-stock-audit-draft";

const draft: AuditItem[] = [
  { id: "a", name: "Amoxil", sku: "A-1", category: "c", systemQty: 9, countedQty: 7, counted: true },
];

describe("Start over on the cycle count", () => {
  const posts: string[] = [];

  beforeEach(() => {
    posts.length = 0;
    localStorage.clear();
    global.fetch = vi.fn(async (url: string, init?: RequestInit) => {
      if (init?.method === "POST") posts.push(url);
      const session = {
        id: "S1",
        status: "in_progress",
        active_till_id: "TILL-A",
        lease_version: 1,
        submitted_stock_audit_id: null,
        items: [],
      };
      return { ok: true, status: 200, json: async () => ({ success: true, session }) } as Response;
    }) as unknown as typeof fetch;
    useStockAuditDraftStore.setState({ items: draft, activeStoreId: null, loadedStoreId: null });
  });

  it("abandons the till's cloud session so its counts cannot come back", async () => {
    render(
      <QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>
        <StockAudits onClose={vi.fn()} />
      </QueryClientProvider>,
    );
    await waitFor(() =>
      expect(vi.mocked(global.fetch).mock.calls.some(([u]) => String(u).includes("/active"))).toBe(true),
    );

    fireEvent.pointerDown(screen.getByRole("button", { name: /more export options/i }));
    fireEvent.click(screen.getByRole("menuitem", { name: /Start over/ }));
    fireEvent.click(await screen.findByRole("button", { name: /^Start over$/ }));

    await waitFor(() => expect(posts).toContain("https://api.test/api/v1/app/audit-sessions/S1/abandon"));
    expect(useStockAuditDraftStore.getState().items.some((i) => i.counted)).toBe(false);
  });
});
