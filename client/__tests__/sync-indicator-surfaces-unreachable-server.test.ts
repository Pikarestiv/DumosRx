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

const mockSync = vi.fn((_isManual?: boolean) => Promise.resolve({
  success: true,
  pushed: 0,
  pulled: 0,
  error: undefined as string | undefined,
}));

vi.mock("@tanstack/react-query", () => ({
  useQuery: () => ({ data: 0 }),
}));

vi.mock("@/lib/db/queries/setup", () => ({
  getSyncQueueCount: vi.fn(() => Promise.resolve(0)),
}));

vi.mock("@/lib/db/sync-engine", () => ({
  sync: mockSync,
  isSyncing: () => false,
  SYNC_IN_PROGRESS_ERROR: "Sync already in progress",
}));

vi.mock("@/lib/db/core", () => ({
  addSyncQueueChangeListener: vi.fn(() => () => {}),
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

// A-273. The expected-noise list widened to cover genuine network failures so they stop filling Sentry and the `feedback`…
// Rationale: docs/CLIENT_COMMENTS.md#block-__tests__-sync-indicator-surfaces-unreachable-server-test-ts-L75
describe("SyncIndicator surfaces an unreachable server", () => {
  let container: HTMLDivElement;
  let root: Root;

  beforeEach(() => {
    vi.useFakeTimers();
    mockSync.mockReset();
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
    await act(() => {
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
