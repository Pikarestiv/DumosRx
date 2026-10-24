import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import React, { act } from "react";
import { createRoot, type Root } from "react-dom/client";

(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

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

let mockSyncResult: { success: boolean; error?: string } = { success: true };
const mockSync = vi.fn(() => Promise.resolve(mockSyncResult));

let mockPendingCount = 0;
vi.mock("@tanstack/react-query", () => ({
  useQuery: () => ({ data: mockPendingCount }),
}));

vi.mock("@/lib/db/queries/setup", () => ({
  getSyncQueueCount: vi.fn(() => Promise.resolve(mockPendingCount)),
}));

vi.mock("@/lib/db/sync-engine", () => ({
  sync: mockSync,
  isSyncing: () => false,
  SYNC_IN_PROGRESS_ERROR: "Sync already in progress",
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
  useStore: () => ({ storeProfile: { auto_sync_enabled: 0, auto_sync_interval: 15 } }),
}));

vi.mock("@/lib/context/auth-context", () => ({
  useAuth: () => ({ isImpersonating: false }),
}));

vi.mock("@/lib/db/DatabaseProvider", () => ({
  useDatabase: () => ({ isReadOnlyTab: false }),
}));

// U3: the indicator under-reported real backlogs (pending state was gated on the last sync being 30+ minutes stale, so uns…
// Rationale: docs/CLIENT_COMMENTS.md#block-__tests__-sync-indicator-pending-and-concurrent-test-tsx-L66
describe("SyncIndicator pending state and concurrent-sync handling", () => {
  let container: HTMLDivElement;
  let root: Root;

  beforeEach(() => {
    mockSync.mockClear();
    mockSyncResult = { success: true };
    mockPendingCount = 0;
    container = document.createElement("div");
    document.body.appendChild(container);
    localStorage.setItem("auth_token", "test-token");
  });

  afterEach(() => {
    act(() => root?.unmount());
    container.remove();
    localStorage.clear();
  });

  async function render() {
    const { SyncIndicator } = await import(
      "@/components/dashboard/sync-indicator"
    );
    root = createRoot(container);
    await act(() => {
      root.render(React.createElement(SyncIndicator, { collapsed: false }));
    });
  }

  it("shows pending sync as soon as there is a backlog, not only once the last sync is stale", async () => {
    // A sync that just finished, plus a real backlog of unsynced rows.
    localStorage.setItem("last_sync_time", new Date().toISOString());
    mockPendingCount = 4;

    await render();

    expect(container.textContent).toContain("Pending Sync");
    expect(container.textContent).not.toContain("Cloud Active");
  });

  it("tells the cashier the backlog is not backed up when the till is unlinked", async () => {
    localStorage.removeItem("auth_token");
    mockPendingCount = 3;

    await render();

    expect(container.textContent).toContain("Not Backed Up");
    expect(container.textContent).not.toContain("Pending Sync");
  });

  it("still reports an unlinked till with no backlog as Not Linked", async () => {
    localStorage.removeItem("auth_token");
    mockPendingCount = 0;

    await render();

    expect(container.textContent).toContain("Not Linked");
  });

  it("still shows cloud active when there is no backlog", async () => {
    localStorage.setItem("last_sync_time", new Date().toISOString());
    mockPendingCount = 0;

    await render();

    expect(container.textContent).toContain("Cloud Active");
  });

  it("treats a concurrent-sync refusal as a no-op rather than a sync error", async () => {
    mockSyncResult = { success: false, error: "Sync already in progress" };

    await render();
    const card = container.querySelector("#tour-sync-indicator") as HTMLElement;
    await act(async () => {
      card.click();
      await Promise.resolve();
    });

    expect(mockSync).toHaveBeenCalled();
    expect(container.textContent).not.toContain("Sync Error");
  });

  it("still reports a genuine sync failure", async () => {
    mockSyncResult = { success: false, error: "Server unreachable" };

    await render();
    const card = container.querySelector("#tour-sync-indicator") as HTMLElement;
    await act(async () => {
      card.click();
      await Promise.resolve();
    });

    expect(container.textContent).toContain("Sync Error");
  });
});
