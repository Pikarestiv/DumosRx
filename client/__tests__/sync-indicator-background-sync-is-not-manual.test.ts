import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import React, { act } from "react";
import { createRoot, type Root } from "react-dom/client";

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

const mockSync = vi.fn(async (_isManual?: boolean) => ({
  success: true,
  pushed: 0,
  pulled: 0,
}));

vi.mock("@tanstack/react-query", () => ({
  useQuery: () => ({ data: 0 }),
}));

vi.mock("@/lib/db/queries/setup", () => ({
  getSyncQueueCount: vi.fn(async () => 0),
}));

vi.mock("@/lib/db/sync-engine", () => ({
  sync: mockSync,
  isSyncing: () => false,
  SYNC_IN_PROGRESS_ERROR: "Sync already in progress",
}));

let registeredListener: ((tables: string[]) => void) | null = null;
vi.mock("@/lib/db/core", () => ({
  addSyncQueueChangeListener: vi.fn((fn: (tables: string[]) => void) => {
    registeredListener = fn;
    return () => {
      registeredListener = null;
    };
  }),
}));

vi.mock("@/components/dashboard/auth-modal", () => ({ AuthModal: () => null }));

vi.mock("sonner", () => ({
  toast: { success: vi.fn(), error: vi.fn(), info: vi.fn() },
}));

vi.mock("@/lib/query-keys", () => ({
  queryKeys: { sync: { queueCount: () => ({ queryKey: ["syncQueueCount"] }) } },
}));

vi.mock("@/lib/context/auth-context", () => ({
  useAuth: () => ({ isImpersonating: false }),
}));

vi.mock("@/lib/db/DatabaseProvider", () => ({
  useDatabase: () => ({ isReadOnlyTab: false }),
}));

// eslint-disable-next-line @typescript-eslint/no-explicit-any
let mockStoreProfile: any = null;
vi.mock("@/lib/context/store-context", () => ({
  useStore: () => ({ storeProfile: mockStoreProfile }),
}));

/**
 * The background auto-sync daemon used to call the very same handler the
 * "Sync Now" button does, so every automatic sync went out flagged
 * `manual` - which on the client means "ignore each queue item's
 * exponential backoff" and on the server means "skip the plan's
 * sync-interval throttle" (see docs/FIXED_BUGS.md, A-5). Only a real user
 * click is manual.
 */
describe("SyncIndicator background sync is not flagged manual", () => {
  let container: HTMLDivElement;
  let root: Root;

  beforeEach(() => {
    vi.useFakeTimers();
    mockSync.mockClear();
    registeredListener = null;
    container = document.createElement("div");
    document.body.appendChild(container);
    localStorage.setItem("auth_token", "test-token");
  });

  afterEach(() => {
    act(() => root?.unmount());
    container.remove();
    localStorage.removeItem("auth_token");
    vi.useRealTimers();
  });

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  async function render(storeProfile: any) {
    mockStoreProfile = storeProfile;
    const { SyncIndicator } = await import(
      "@/components/dashboard/sync-indicator"
    );
    root = createRoot(container);
    await act(async () => {
      root.render(React.createElement(SyncIndicator, { collapsed: false }));
    });
  }

  it("the instant-mode (interval 0) daemon syncs with manual = false", async () => {
    await render({ auto_sync_enabled: 1, auto_sync_interval: 0 });

    await act(async () => {
      registeredListener?.(["products"]);
    });
    await act(async () => {
      vi.advanceTimersByTime(2000);
      await Promise.resolve();
    });

    expect(mockSync).toHaveBeenCalledTimes(1);
    expect(mockSync.mock.calls[0][0]).toBe(false);
  });

  it("the polling daemon syncs with manual = false", async () => {
    await render({ auto_sync_enabled: 1, auto_sync_interval: 10 });

    await act(async () => {
      vi.advanceTimersByTime(10 * 60 * 1000);
      await Promise.resolve();
    });

    expect(mockSync).toHaveBeenCalledTimes(1);
    expect(mockSync.mock.calls[0][0]).toBe(false);
  });

  it("the Sync Now button still syncs with manual = true", async () => {
    await render({ auto_sync_enabled: 1, auto_sync_interval: 10 });

    const button = container.querySelector<HTMLButtonElement>(
      '[data-testid="sync-now-button"]',
    );
    expect(button).not.toBeNull();

    await act(async () => {
      button!.click();
      await Promise.resolve();
    });

    expect(mockSync).toHaveBeenCalledTimes(1);
    expect(mockSync.mock.calls[0][0]).toBe(true);
  });
});
