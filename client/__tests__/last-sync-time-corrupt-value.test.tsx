import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import React, { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { getLastSyncTime } from "@/lib/storage-keys";

(globalThis as any).IS_REACT_ACT_ENVIRONMENT = true;

if (!window.matchMedia) {
  window.matchMedia = ((query: string) => ({
    matches: false,
    media: query,
    onchange: null,
    addListener: () => {},
    removeListener: () => {},
    addEventListener: () => {},
    removeEventListener: () => {},
    dispatchEvent: () => false,
  })) as unknown as typeof window.matchMedia;
}

vi.mock("@tanstack/react-query", () => ({
  useQuery: () => ({ data: 0 }),
}));

vi.mock("@/lib/db/queries/setup", () => ({
  getSyncQueueCount: vi.fn(async () => 0),
}));

vi.mock("@/lib/db/sync-engine", () => ({
  sync: vi.fn(async () => ({ success: true, pushed: 0, pulled: 0 })),
  isSyncing: () => false,
}));

vi.mock("@/lib/db/core", () => ({
  addSyncQueueChangeListener: vi.fn(() => () => {}),
}));

vi.mock("@/components/dashboard/auth-modal", () => ({
  AuthModal: () => null,
}));

vi.mock("sonner", () => ({
  toast: { success: vi.fn(), error: vi.fn(), info: vi.fn() },
}));

vi.mock("@/lib/query-keys", () => ({
  queryKeys: { sync: { queueCount: () => ({ queryKey: ["syncQueueCount"] }) } },
}));

vi.mock("@/lib/context/store-context", () => ({
  useStore: () => ({ storeProfile: { auto_sync_enabled: 0, auto_sync_interval: 0 } }),
}));

vi.mock("@/lib/context/auth-context", () => ({
  useAuth: () => ({ isImpersonating: false }),
}));

vi.mock("@/lib/db/DatabaseProvider", () => ({
  useDatabase: () => ({ isReadOnlyTab: false }),
}));

const CORRUPT_VALUES = ["undefined", "null", "", "not-a-date", "2026-13-45T99:99", "[object Object]"];

describe("A-223: getLastSyncTime() validates what it read", () => {
  afterEach(() => localStorage.clear());

  it.each(CORRUPT_VALUES)("returns null for the unparseable value %j", (stored) => {
    localStorage.setItem("last_sync_time", stored);
    expect(getLastSyncTime()).toBeNull();
  });

  it("still returns a parseable stored timestamp untouched", () => {
    const iso = "2026-10-10T08:53:29.000Z";
    localStorage.setItem("last_sync_time", iso);
    expect(getLastSyncTime()).toBe(iso);
  });
});

describe("A-223: SyncIndicator with a corrupt stored sync time", () => {
  let container: HTMLDivElement;
  let root: Root;

  beforeEach(() => {
    container = document.createElement("div");
    document.body.appendChild(container);
    localStorage.setItem("auth_token", "test-token");
  });

  afterEach(() => {
    act(() => root?.unmount());
    container.remove();
    localStorage.clear();
  });

  it("renders as 'never synced' instead of throwing RangeError: Invalid time value", async () => {
    localStorage.setItem("last_sync_time", "undefined");
    const { SyncIndicator } = await import("@/components/dashboard/sync-indicator");
    root = createRoot(container);
    await act(async () => {
      root.render(React.createElement(SyncIndicator, { collapsed: false }));
    });
    expect(container.textContent).toContain("never");
  });
});
