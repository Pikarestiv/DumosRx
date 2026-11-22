import { describe, it, expect, vi, beforeEach } from "vitest";
import { renderHook, act } from "@testing-library/react";

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

import { useCloudAuditSession } from "@/lib/hooks/use-cloud-audit-session";
import { useStockAuditDraftStore } from "@/lib/hooks/use-stock-audit-draft";
import { freshSheet, json, session } from "./helpers/cloud-audit-session-harness";

async function mountAndInit() {
  const hook = renderHook(() => useCloudAuditSession("store-1"));
  await act(async () => {
    await hook.result.current.initSession(useStockAuditDraftStore.getState().items);
  });
  return hook;
}

function stubActiveStatusFetch(activeBody: Record<string, unknown>, startCalls: string[]) {
  global.fetch = vi.fn((url: string, init?: RequestInit) => {
    if (url.includes("/active")) return Promise.resolve(json(activeBody));
    if (url.endsWith("/app/audit-sessions") && init?.method === "POST") startCalls.push(url);
    return Promise.resolve(json({ success: true }));
  }) as unknown as typeof fetch;
}

describe("cross-till draft lifecycle resolution", () => {
  beforeEach(() => {
    localStorage.clear();
    useStockAuditDraftStore.setState({
      items: freshSheet,
      drafts: {},
      cloudSessionId: null,
      cloudSessionIds: {},
      activeStoreId: null,
      loadedStoreId: null,
    });
  });

  it("clears a stale local draft and does not start a new session when its cloud session was completed elsewhere", async () => {
    const startCalls: string[] = [];
    stubActiveStatusFetch({ success: true, session: null, known_session_status: "completed" }, startCalls);

    useStockAuditDraftStore.setState({
      activeStoreId: "store-1",
      items: [{ ...freshSheet[0], counted: true, countedQty: 5 }],
      cloudSessionId: "sess-completed",
      cloudSessionIds: { "store-1": "sess-completed" },
    });

    const hook = await mountAndInit();

    expect(startCalls).toHaveLength(0);
    expect(useStockAuditDraftStore.getState().items).toEqual([]);
    expect(useStockAuditDraftStore.getState().cloudSessionId).toBeNull();
    expect(hook.result.current.session).toBeNull();
  });

  it("locks editing and preserves local recovery data when a session is completion_pending_sync", async () => {
    const startCalls: string[] = [];
    stubActiveStatusFetch(
      {
        success: true,
        session: session({
          id: "sess-pending",
          status: "completion_pending_sync",
          active_till_id: "TILL-B",
          submitted_stock_audit_id: "audit-1",
        }),
        known_session_status: "completion_pending_sync",
      },
      startCalls,
    );

    useStockAuditDraftStore.setState({
      activeStoreId: "store-1",
      items: [{ ...freshSheet[0], counted: true, countedQty: 5 }],
      cloudSessionId: "sess-pending",
      cloudSessionIds: { "store-1": "sess-pending" },
    });

    const hook = await mountAndInit();

    expect(startCalls).toHaveLength(0);
    expect(hook.result.current.isReadOnly).toBe(true);
    expect(hook.result.current.draftResolution).toBe("pending_sync");
    expect(useStockAuditDraftStore.getState().items).toHaveLength(1);
  });

  it("holds counted local items in explicit abandoned recovery mode instead of wiping or recreating", async () => {
    const startCalls: string[] = [];
    stubActiveStatusFetch({ success: true, session: null, known_session_status: "abandoned" }, startCalls);

    useStockAuditDraftStore.setState({
      activeStoreId: "store-1",
      items: [{ ...freshSheet[0], counted: true, countedQty: 5 }],
      cloudSessionId: "sess-abandoned",
      cloudSessionIds: { "store-1": "sess-abandoned" },
    });

    const hook = await mountAndInit();

    expect(startCalls).toHaveLength(0);
    expect(hook.result.current.isReadOnly).toBe(true);
    expect(hook.result.current.draftResolution).toBe("abandoned");
    expect(useStockAuditDraftStore.getState().items).toHaveLength(1);
  });

  it("does not silently start a new session when knownSessionId is set and status is null", async () => {
    const startCalls: string[] = [];
    stubActiveStatusFetch({ success: true, session: null, known_session_status: null }, startCalls);

    useStockAuditDraftStore.setState({
      activeStoreId: "store-1",
      items: [{ ...freshSheet[0], counted: true, countedQty: 5 }],
      cloudSessionId: "sess-unknown",
      cloudSessionIds: { "store-1": "sess-unknown" },
    });

    await mountAndInit();

    expect(startCalls).toHaveLength(0);
    expect(useStockAuditDraftStore.getState().items).toHaveLength(1);
  });
});
