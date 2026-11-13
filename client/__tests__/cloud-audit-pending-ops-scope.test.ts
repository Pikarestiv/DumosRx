import { describe, it, expect, vi, beforeEach } from "vitest";
import { renderHook, act } from "@testing-library/react";
import type { CloudAuditSession } from "@/lib/api/audit-sessions";

const device = vi.hoisted(() => ({ activeStoreId: "store-1" }));

vi.mock("@/lib/utils/device-id", () => ({ getDeviceId: () => "TILL-A" }));
vi.mock("@/lib/utils/device-label", () => ({ getDeviceLabel: () => "Front till" }));
vi.mock("@/lib/storage-keys", async (importOriginal) => ({
  ...(await importOriginal<object>()),
  getStoredActiveStoreId: () => device.activeStoreId,
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
import {
  PENDING_AUDIT_SESSION_OPS_KEY,
  flushAuditSessionOps,
  pendingAuditSessionIds,
} from "@/lib/hooks/cloud-audit-pending-ops";
import { useStockAuditDraftStore } from "@/lib/hooks/use-stock-audit-draft";

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
    lease_version: 3,
    lease_expires_at: null,
    total_items_count: 1,
    counted_items_count: 0,
    submitted_stock_audit_id: null,
    started_at: "2026-11-10T09:00:00Z",
    completed_at: null,
    last_synced_at: null,
    items: [],
    ...overrides,
  };
}

function json(body: unknown, status = 200): Response {
  return { ok: status < 400, status, json: () => Promise.resolve(body) } as Response;
}

type Call = { url: string; storeHeader?: string; body: Record<string, unknown> };

function serveStoreScopedServer(options: { reachable: () => boolean; abandonStatus?: number }) {
  const calls: Call[] = [];
  global.fetch = vi.fn((url: string, init?: RequestInit) => Promise.resolve().then(() => {
    if (!options.reachable()) throw new TypeError("Failed to fetch");
    const storeHeader = (init?.headers as Record<string, string> | undefined)?.["X-Store-Id"];
    const body = init?.body ? JSON.parse(init.body as string) : {};
    calls.push({ url, storeHeader, body });
    if (url.includes("/active")) return json({ success: true, session: session() });
    if (storeHeader !== "store-1") return json({ message: "Unauthorized access to this store audit session." }, 403);
    if (url.endsWith("/abandon") && options.abandonStatus === 409) {
      return json({ message: "Lease has been superseded or expired on this device.", session: session() }, 409);
    }
    return json({ success: true, session: session({ status: "completion_pending_sync" }) });
  })) as unknown as typeof fetch;
  return calls;
}

async function openOnStore1() {
  const hook = renderHook(() => useCloudAuditSession("store-1"));
  await act(async () => {
    await hook.result.current.initSession([]);
  });
  return hook;
}

describe("queued audit session ops carry their own store", () => {
  beforeEach(() => {
    localStorage.clear();
    device.activeStoreId = "store-1";
    useStockAuditDraftStore.setState({ items: [], drafts: {}, activeStoreId: null, loadedStoreId: null });
  });

  it("a completion queued under store 1 is sent to store 1 after the owner switched to store 2", async () => {
    let online = true;
    const calls = serveStoreScopedServer({ reachable: () => online });
    const hook = await openOnStore1();
    online = false;
    await act(async () => {
      await hook.result.current.complete("audit-1");
    });
    hook.unmount();
    expect(pendingAuditSessionIds().has("S1")).toBe(true);

    device.activeStoreId = "store-2";
    online = true;
    await flushAuditSessionOps();

    const completeCall = calls.find((c) => c.url.endsWith("/S1/complete"));
    expect(completeCall?.storeHeader).toBe("store-1");
    expect(completeCall?.body.submitted_stock_audit_id).toBe("audit-1");
    expect(pendingAuditSessionIds().has("S1")).toBe(false);
  });

  it("an entry queued before ops carried a store survives a 403 until it is flushed from its own store", async () => {
    localStorage.setItem(
      PENDING_AUDIT_SESSION_OPS_KEY,
      JSON.stringify([{ kind: "complete", sessionId: "S1", leaseVersion: 3, submittedStockAuditId: "audit-1" }]),
    );
    const calls = serveStoreScopedServer({ reachable: () => true });

    device.activeStoreId = "store-2";
    await flushAuditSessionOps();
    expect(calls.at(-1)?.storeHeader).toBe("store-2");
    expect(pendingAuditSessionIds().has("S1")).toBe(true);

    device.activeStoreId = "store-1";
    await flushAuditSessionOps();
    expect(calls.at(-1)?.storeHeader).toBe("store-1");
    expect(pendingAuditSessionIds().has("S1")).toBe(false);
  });

  it("an abandon names the till and lease it held, and is sent to its own store", async () => {
    let online = true;
    const calls = serveStoreScopedServer({ reachable: () => online });
    const hook = await openOnStore1();
    online = false;
    await act(async () => {
      await hook.result.current.abandon("Started over");
    });
    hook.unmount();

    device.activeStoreId = "store-2";
    online = true;
    await flushAuditSessionOps();

    const abandonCall = calls.find((c) => c.url.endsWith("/S1/abandon"));
    expect(abandonCall?.storeHeader).toBe("store-1");
    expect(abandonCall?.body).toEqual({ reason: "Started over", till_id: "TILL-A", lease_version: 3 });
    expect(pendingAuditSessionIds().has("S1")).toBe(false);
  });

  it("drops an abandon the server refuses because another till took the count over", async () => {
    serveStoreScopedServer({ reachable: () => true, abandonStatus: 409 });
    const hook = await openOnStore1();
    await act(async () => {
      await hook.result.current.abandon("Started over");
    });

    expect(pendingAuditSessionIds().has("S1")).toBe(false);
    expect(hook.result.current.conflictMessage).toBeNull();
    expect(hook.result.current.isReadOnly).toBe(false);
  });

  it("still sends an abandon queued by an older build without lease fields", async () => {
    localStorage.setItem(
      PENDING_AUDIT_SESSION_OPS_KEY,
      JSON.stringify([{ kind: "abandon", sessionId: "S1", reason: "Started over" }]),
    );
    const calls = serveStoreScopedServer({ reachable: () => true });

    await flushAuditSessionOps();

    expect(calls.at(-1)?.body).toEqual({ reason: "Started over" });
    expect(pendingAuditSessionIds().has("S1")).toBe(false);
  });
});
