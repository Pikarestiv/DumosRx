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
  error: undefined as string | undefined,
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
 * A-273. The expected-noise list widened to cover genuine network failures so
 * they stop filling Sentry and the `feedback` table, and the first cut had the
 * indicator reading that same widened list — which made an unreachable server
 * display "online" on an automatic sync. In a POS a cashier shown "online"
 * while nothing reaches the server is the silent divergence the whole change
 * exists to prevent, so the indicator reads `isExpectedPlanRestriction` and a
 * network failure still surfaces. See client/AGENTS.md, "Expected sync noise".
 */
describe("SyncIndicator surfaces an unreachable server", () => {
  let container: HTMLDivElement;
  let root: Root;

  beforeEach(() => {
    vi.useFakeTimers();
    mockSync.mockReset();
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

  async function renderAndAutoSync(error: string) {
    mockSync.mockResolvedValue({
      success: false,
      pushed: 0,
      pulled: 0,
      error,
    });
    mockStoreProfile = { auto_sync_enabled: 1, auto_sync_interval: 10 };
    const { SyncIndicator } = await import(
      "@/components/dashboard/sync-indicator"
    );
    root = createRoot(container);
    await act(async () => {
      root.render(React.createElement(SyncIndicator, { collapsed: false }));
    });
    await act(async () => {
      vi.advanceTimersByTime(10 * 60 * 1000);
      await Promise.resolve();
    });
    return container.textContent ?? "";
  }

  it("shows the failure when the server cannot be reached", async () => {
    const text = await renderAndAutoSync("Failed to fetch");

    expect(mockSync).toHaveBeenCalledTimes(1);
    expect(text).toContain("Sync Error");
  });

  it("still stays quiet for a plan restriction, which is the server telling it to wait", async () => {
    const text = await renderAndAutoSync(
      "Sync limit reached. Your current plan synchronizes once every 30 minutes.",
    );

    expect(mockSync).toHaveBeenCalledTimes(1);
    expect(text).not.toContain("Sync Error");
  });
});
