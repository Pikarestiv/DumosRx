import { describe, it, expect, vi, beforeEach } from "vitest";
import { renderHook, act, waitFor } from "@testing-library/react";
import type { AuditItem } from "@/components/stock-batch/stock-audits";
import type { CloudAuditSession } from "@/lib/api/audit-sessions";

vi.mock("@/lib/utils/device-id", () => ({ getDeviceId: () => "TILL-A" }));
vi.mock("@/lib/utils/device-label", () => ({ getDeviceLabel: () => "Front till" }));
vi.mock("@/lib/storage-keys", async (importOriginal) => ({
  ...(await importOriginal<object>()),
  getStoredActiveStoreId: () => "store-1",
  getStoredUser: () => ({ id: "user-1" }),
}));
vi.mock("@/lib/api/token-manager", () => ({ getToken: () => "jwt" }));
vi.mock("@/lib/api/client", () => ({
  apiClient: { getBaseURL: () => "https://api.test/api/v1" },
}));
vi.mock("idb-keyval", () => ({
  get: vi.fn(() => Promise.resolve(undefined)),
  set: vi.fn(() => Promise.resolve(undefined)),
}));

import {
  mergeCloudItemsIntoLocal,
  useCloudAuditSession,
} from "@/lib/hooks/use-cloud-audit-session";
import { useStockAuditDraftStore } from "@/lib/hooks/use-stock-audit-draft";

const freshSheet: AuditItem[] = [
  { id: "p1", name: "Amoxil", sku: "A", category: "c", systemQty: 20 },
  { id: "p2", name: "Flagyl", sku: "F", category: "c", systemQty: 8 },
];

function session(overrides: Partial<CloudAuditSession> = {}): CloudAuditSession {
  return {
    id: "S1",
    store_id: "store-1",
    created_by: "user-1",
    name: null,
    notes: null,
    status: "in_progress",
    active_till_id: "TILL-A",
    active_till_name: "Front till",
    active_user_id: "user-1",
    lease_version: 1,
    lease_expires_at: null,
    total_items_count: 2,
    counted_items_count: 1,
    submitted_stock_audit_id: null,
    started_at: "2026-11-10T09:00:00Z",
    completed_at: null,
    last_synced_at: null,
    items: [
      { product_id: "p1", counted: true, counted_quantity: 15, counted_at: "2026-11-10T09:05:00Z" },
    ],
    ...overrides,
  };
}

type Route = (url: string, init?: RequestInit) => Response | Promise<Response>;

function json(body: unknown, status = 200): Response {
  return { ok: status < 400, status, json: async () => body } as Response;
}

function serve(routes: { active: () => CloudAuditSession | null; complete: Route }) {
  const calls: { url: string; body?: string }[] = [];
  global.fetch = vi.fn(async (url: string, init?: RequestInit) => {
    calls.push({ url, body: init?.body as string | undefined });
    if (url.includes("/active")) return json({ success: true, session: routes.active() });
    if (url.endsWith("/complete")) return routes.complete(url, init);
    if (url.endsWith("/abandon")) return json({ success: true, session: null });
    return json({ success: true, last_synced_at: null });
  }) as unknown as typeof fetch;
  return calls;
}

const networkDown: Route = () => {
  throw new TypeError("Failed to fetch");
};

async function mountAndInit() {
  const hook = renderHook(() => useCloudAuditSession("store-1"));
  await act(async () => {
    await hook.result.current.initSession(useStockAuditDraftStore.getState().items);
  });
  return hook;
}

function countedIds(): string[] {
  return useStockAuditDraftStore
    .getState()
    .items.filter((i) => i.counted)
    .map((i) => i.id);
}

describe("cloud audit session lifecycle", () => {
  beforeEach(() => {
    localStorage.clear();
    useStockAuditDraftStore.setState({
      items: freshSheet,
      drafts: {},
      activeStoreId: null,
      loadedStoreId: null,
    });
  });

  it("an offline submit never lets its session's counts resurface in the next count", async () => {
    serve({ active: () => session(), complete: networkDown });
    const first = await mountAndInit();
    await act(async () => {
      await first.result.current.complete("audit-1");
    });
    first.unmount();

    useStockAuditDraftStore.setState({ items: freshSheet });
    const second = await mountAndInit();

    expect(countedIds()).toEqual([]);
    expect(second.result.current.session).toBeNull();
    expect(second.result.current.isReadOnly).toBe(false);
  });

  it("retries the completion on the next open once the server is reachable", async () => {
    serve({ active: () => session(), complete: networkDown });
    const first = await mountAndInit();
    await act(async () => {
      await first.result.current.complete("audit-1");
    });
    first.unmount();

    let completed = false;
    const calls = serve({
      active: () => (completed ? null : session()),
      complete: () => {
        completed = true;
        return json({ success: true, session: session({ status: "completion_pending_sync" }) });
      },
    });
    useStockAuditDraftStore.setState({ items: freshSheet });
    await mountAndInit();

    const completeCall = calls.find((c) => c.url.endsWith("/S1/complete"));
    expect(JSON.parse(completeCall?.body ?? "{}").submitted_stock_audit_id).toBe("audit-1");
    expect(countedIds()).toEqual([]);
  });

  it("does not merge rows from a session that is waiting for its submitted audit to sync", async () => {
    serve({
      active: () =>
        session({ status: "completion_pending_sync", submitted_stock_audit_id: "audit-9" }),
      complete: networkDown,
    });

    const hook = await mountAndInit();

    expect(countedIds()).toEqual([]);
    expect(hook.result.current.isReadOnly).toBe(false);
  });

  it("does not merge rows from a session that already names its submitted audit", async () => {
    serve({ active: () => session({ submitted_stock_audit_id: "audit-9" }), complete: networkDown });
    await mountAndInit();
    expect(countedIds()).toEqual([]);
  });

  it("still resumes a live in-progress session's counts", async () => {
    serve({ active: () => session(), complete: networkDown });
    await mountAndInit();
    expect(countedIds()).toEqual(["p1"]);
  });

  it("re-pushes the counted rows to the held session when the till comes back online", async () => {
    const calls = serve({ active: () => session({ items: [] }), complete: networkDown });
    useStockAuditDraftStore.setState({
      items: [{ ...freshSheet[0], counted: true, countedQty: 18, countedAt: "2026-11-10T10:00:00Z" }, freshSheet[1]],
    });
    await mountAndInit();

    vi.useFakeTimers();
    try {
      window.dispatchEvent(new Event("online"));
      await act(async () => {
        await vi.advanceTimersByTimeAsync(2_000);
      });
    } finally {
      vi.useRealTimers();
    }

    const pushed = calls.find((c) => c.url.endsWith("/S1/sync-items"));
    expect(JSON.parse(pushed?.body ?? "{}").items).toEqual([
      expect.objectContaining({ product_id: "p1", counted_quantity: 18, counted_at: "2026-11-10T10:00:00Z" }),
    ]);
  });

  it("queues an abandon made offline and sends it on the next open", async () => {
    serve({ active: () => session(), complete: networkDown });
    const first = await mountAndInit();
    global.fetch = vi.fn(async () => {
      throw new TypeError("Failed to fetch");
    }) as unknown as typeof fetch;
    await act(async () => {
      await first.result.current.abandon("Started over");
    });
    first.unmount();

    useStockAuditDraftStore.setState({ items: freshSheet });
    const calls = serve({ active: () => null, complete: networkDown });
    await mountAndInit();

    await waitFor(() => expect(calls.some((c) => c.url.endsWith("/S1/abandon"))).toBe(true));
    expect(countedIds()).toEqual([]);
  });
});

describe("merging cloud rows into the local sheet", () => {
  const local = (overrides: Partial<AuditItem>): AuditItem => ({
    id: "p1",
    name: "Amoxil",
    sku: "A",
    category: "c",
    systemQty: 20,
    ...overrides,
  });

  it("keeps a local recount that is newer than the cloud figure", () => {
    const [merged] = mergeCloudItemsIntoLocal(
      [local({ counted: true, countedQty: 18, countedAt: "2026-11-10T10:00:00Z" })],
      [{ product_id: "p1", counted: true, counted_quantity: 15, counted_at: "2026-11-10T09:00:00Z" }],
    );
    expect(merged.countedQty).toBe(18);
  });

  it("takes a cloud figure that is newer than the local count", () => {
    const [merged] = mergeCloudItemsIntoLocal(
      [local({ counted: true, countedQty: 18, countedAt: "2026-11-10T08:00:00Z" })],
      [{ product_id: "p1", counted: true, counted_quantity: 15, counted_at: "2026-11-10T09:00:00Z" }],
    );
    expect(merged.countedQty).toBe(15);
    expect(merged.countedAt).toBe("2026-11-10T09:00:00Z");
  });

  it("keeps a local count with no timestamp (a draft from before counts were stamped)", () => {
    const [merged] = mergeCloudItemsIntoLocal(
      [local({ counted: true, countedQty: 18 })],
      [{ product_id: "p1", counted: true, counted_quantity: 15, counted_at: "2026-11-10T09:00:00Z" }],
    );
    expect(merged.countedQty).toBe(18);
  });

  it("keeps a local count when the cloud row has no timestamp", () => {
    const [merged] = mergeCloudItemsIntoLocal(
      [local({ counted: true, countedQty: 18, countedAt: "2026-11-10T08:00:00Z" })],
      [{ product_id: "p1", counted: true, counted_quantity: 15, counted_at: null }],
    );
    expect(merged.countedQty).toBe(18);
  });

  it("fills a row nobody has counted locally", () => {
    const [merged] = mergeCloudItemsIntoLocal(
      [local({})],
      [{ product_id: "p1", counted: true, counted_quantity: 15, counted_at: null }],
    );
    expect(merged.counted).toBe(true);
    expect(merged.countedQty).toBe(15);
  });
});

describe("stamping counts for the cloud merge", () => {
  it("sends the moment a row was counted, not the moment it was pushed", async () => {
    const { toCloudItem } = await import("@/lib/hooks/use-cloud-audit-session");
    const cloud = toCloudItem({
      id: "p1",
      name: "Amoxil",
      sku: "A",
      category: "c",
      systemQty: 20,
      counted: true,
      countedQty: 3,
      baselineQty: 20,
      countedAt: "2026-11-10T08:00:00Z",
    });
    expect(cloud.counted_at).toBe("2026-11-10T08:00:00Z");
  });

  it("stamps a row edited on the ledger with when it was counted", async () => {
    const { useAuditCounting } = await import("@/lib/hooks/use-audit-counting");
    useStockAuditDraftStore.setState({ items: freshSheet });
    const { result } = renderHook(() => useAuditCounting());
    const before = Date.now();

    act(() => result.current.updateLedgerItem("p1", { countedQty: 4 }));

    const stamped = useStockAuditDraftStore.getState().items[0].countedAt;
    expect(Date.parse(stamped ?? "")).toBeGreaterThanOrEqual(before);
  });
});
