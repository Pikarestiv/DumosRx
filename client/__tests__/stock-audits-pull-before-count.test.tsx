import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, fireEvent, waitFor, within } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { AuditItem } from "@/components/stock-batch/stock-audits";
import type { SyncResult } from "@/lib/db/sync-engine/types";

vi.mock("@tanstack/react-virtual", () => ({
  useVirtualizer: ({ count, estimateSize }: { count: number; estimateSize: () => number }) => ({
    getVirtualItems: () =>
      Array.from({ length: count }, (_, index) => ({ key: index, index, start: index * estimateSize(), size: estimateSize() })),
    getTotalSize: () => count * estimateSize(),
    measureElement: () => {},
  }),
}));
vi.mock("@/lib/context/store-context", () => ({
  useStore: () => ({ storeProfile: { id: "store-1", name: "Test Pharmacy" } }),
}));
vi.mock("@/lib/context/auth-context", () => ({ useAuth: () => ({ user: { id: "u1" } }) }));
vi.mock("@/lib/hooks/use-permissions", () => ({ useHasPermission: () => true }));

let engineSyncing = false;
const syncMock = vi.fn<() => Promise<SyncResult>>();
vi.mock("@/lib/db/sync-engine", () => ({
  sync: () => syncMock(),
  isSyncing: () => engineSyncing,
  SYNC_IN_PROGRESS_ERROR: "Sync already in progress",
}));

let cloudStock = 10;
vi.mock("@/lib/db/queries/products", () => ({
  getProductsWithDetails: vi.fn(() => Promise.resolve([{ id: "a", name: "Amoxil", stock_quantity: cloudStock }])),
}));
vi.mock("@/lib/db/queries/inventory", () => ({ getProductStockQuantity: vi.fn().mockResolvedValue(0) }));
vi.mock("@/lib/hooks/use-stock-audit-mutation", () => ({
  useSubmitStockAuditMutation: () => ({ mutate: vi.fn(), isPending: false }),
}));
vi.mock("@/lib/hooks/use-count-freshness", () => ({ useCountFreshness: () => ({ shouldWarn: false }) }));
vi.mock("@/lib/utils/device-id", () => ({ getDeviceId: () => "TILL-A" }));
vi.mock("@/lib/db/DatabaseProvider", () => ({
  useDatabase: () => ({ isReady: true, isOffline: false, isTauriApp: false, isReadOnlyTab: false, error: null }),
}));
vi.mock("@/lib/api/client", () => ({ apiClient: { getBaseURL: () => "https://api.test/api/v1" } }));

import { StockAudits } from "@/components/stock-batch/stock-audits";
import { useStockAuditDraftStore } from "@/lib/hooks/use-stock-audit-draft";

const SYNCING_TEXT = "Syncing the latest stock before you count...";
const countBox = () => screen.queryByRole("checkbox", { name: /Mark Amoxil as counted/ });
const originalOnLine = Object.getOwnPropertyDescriptor(navigator, "onLine");

function setOnline(value: boolean) {
  Object.defineProperty(navigator, "onLine", { value, configurable: true });
}

function renderAudit() {
  render(
    <QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>
      <StockAudits onClose={vi.fn()} />
    </QueryClientProvider>,
  );
}

describe("Cycle Count pulls the latest stock before counting starts", () => {
  beforeEach(() => {
    localStorage.clear();
    localStorage.setItem("auth_token", "token");
    setOnline(true);
    engineSyncing = false;
    cloudStock = 10;
    syncMock.mockReset();
    global.fetch = vi.fn(() =>
      Promise.resolve({ ok: true, status: 200, json: () => Promise.resolve({ success: true, session: null }) }),
    ) as unknown as typeof fetch;
    useStockAuditDraftStore.setState({ items: [], activeStoreId: null, loadedStoreId: null });
  });

  afterEach(() => {
    if (originalOnLine) Object.defineProperty(navigator, "onLine", originalOnLine);
    localStorage.clear();
  });

  it("holds the sheet until the pull lands, then builds it from the pulled stock", async () => {
    let finishSync: (r: SyncResult) => void = () => {};
    syncMock.mockReturnValue(new Promise((resolve) => (finishSync = resolve)));
    renderAudit();

    expect(await screen.findByText(SYNCING_TEXT)).toBeTruthy();
    expect(countBox()).toBeNull();
    expect(useStockAuditDraftStore.getState().items).toEqual([]);

    cloudStock = 4;
    finishSync({ success: true, pushed: 0, pulled: 1 });

    await waitFor(() => expect(countBox()).not.toBeNull());
    expect(screen.queryByText(SYNCING_TEXT)).toBeNull();
    expect(useStockAuditDraftStore.getState().items.map((i) => i.systemQty)).toEqual([4]);
    expect(screen.queryByRole("note")).toBeNull();
  });

  it("waits for a sync another caller already has in flight, then pulls again", async () => {
    engineSyncing = true;
    syncMock
      .mockResolvedValueOnce({ success: false, pushed: 0, pulled: 0, error: "Sync already in progress" })
      .mockResolvedValueOnce({ success: true, pushed: 0, pulled: 0 });
    renderAudit();

    expect(await screen.findByText(SYNCING_TEXT)).toBeTruthy();
    engineSyncing = false;

    await waitFor(() => expect(countBox()).not.toBeNull());
    expect(syncMock).toHaveBeenCalledTimes(2);
  });

  it("counts offline against the till's last sync, and says so", async () => {
    setOnline(false);
    renderAudit();

    await waitFor(() => expect(countBox()).not.toBeNull());
    expect(syncMock).not.toHaveBeenCalled();
    expect(screen.getByRole("note").textContent).toContain("measured against stock as of its last sync");
  });

  it("blocks counting when an online pull fails, and Retry pulls again", async () => {
    syncMock
      .mockResolvedValueOnce({ success: false, pushed: 0, pulled: 0, error: "Server unreachable" })
      .mockResolvedValueOnce({ success: true, pushed: 0, pulled: 0 });
    renderAudit();

    const alert = await screen.findByRole("alert");
    expect(alert.textContent).toContain("Server unreachable");
    expect(countBox()).toBeNull();

    fireEvent.click(within(alert).getByRole("button", { name: "Retry" }));

    await waitFor(() => expect(countBox()).not.toBeNull());
    expect(syncMock).toHaveBeenCalledTimes(2);
    expect(screen.queryByRole("note")).toBeNull();
  });

  it("lets the counter count anyway only after confirming the risk in a dialog", async () => {
    syncMock.mockResolvedValue({ success: false, pushed: 0, pulled: 0, error: "Server unreachable" });
    renderAudit();

    const alert = await screen.findByRole("alert");
    fireEvent.click(within(alert).getByRole("button", { name: "Count anyway" }));
    const dialog = await screen.findByRole("dialog");
    expect(dialog.textContent).toContain("another till");
    expect(countBox()).toBeNull();

    fireEvent.click(within(dialog).getByRole("button", { name: "Count anyway" }));

    await waitFor(() => expect(countBox()).not.toBeNull());
    expect(screen.getByRole("note")).toBeTruthy();
  });

  it("leaves a resumed draft's counted rows and baselines untouched by the pull", async () => {
    const resumed: AuditItem[] = [
      { id: "a", name: "Amoxil", sku: "A-1", category: "c", systemQty: 9, baselineQty: 9, countedQty: 7, counted: true },
    ];
    useStockAuditDraftStore.setState({ items: resumed });
    cloudStock = 3;
    syncMock.mockResolvedValue({ success: true, pushed: 0, pulled: 1 });
    renderAudit();

    await waitFor(() => expect(countBox()).not.toBeNull());
    const [row] = useStockAuditDraftStore.getState().items;
    expect(row).toMatchObject({ systemQty: 9, baselineQty: 9, countedQty: 7, counted: true });
    expect(useStockAuditDraftStore.getState().items).toHaveLength(1);
  });
});
