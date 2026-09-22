import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import React, { act } from "react";
import { createRoot, type Root } from "react-dom/client";

(globalThis as any).IS_REACT_ACT_ENVIRONMENT = true;

// jsdom doesn't implement matchMedia; components/ui/tooltip.tsx's touch
// detection needs it to exist to mount at all. Same stub as
// sync-indicator-expand-timing.test.ts.
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

const mockSync = vi.fn(async () => ({ success: true, pushed: 0, pulled: 0 }));

vi.mock("@tanstack/react-query", () => ({
  useQuery: () => ({ data: 0 }),
}));

vi.mock("@/lib/db/queries/setup", () => ({
  getSyncQueueCount: vi.fn(async () => 0),
}));

vi.mock("@/lib/db/sync-engine", () => ({
  sync: mockSync,
  isSyncing: () => false,
}));

let registeredListener: (() => void) | null = null;
const unsubscribeSpy = vi.fn();
vi.mock("@/lib/db/core", () => ({
  addSyncQueueChangeListener: vi.fn((fn: () => void) => {
    registeredListener = fn;
    return () => {
      unsubscribeSpy();
      registeredListener = null;
    };
  }),
}));

vi.mock("@/components/dashboard/auth-modal", () => ({
  AuthModal: () => null,
}));

vi.mock("sonner", () => ({
  toast: { success: vi.fn(), error: vi.fn() },
}));

vi.mock("@/lib/query-keys", () => ({
  queryKeys: { sync: { queueCount: () => ({ queryKey: ["syncQueueCount"] }) } },
}));

// SyncIndicator reads isImpersonating from the auth context (sync is
// disabled wholesale during an impersonated session); this is an ordinary
// non-impersonated session.
vi.mock("@/lib/context/auth-context", () => ({
  useAuth: () => ({ isImpersonating: false }),
}));

// eslint-disable-next-line @typescript-eslint/no-explicit-any
let mockStoreProfile: any = null;
vi.mock("@/lib/context/store-context", () => ({
  useStore: () => ({ storeProfile: mockStoreProfile }),
}));

describe("SyncIndicator instant sync (auto_sync_interval === 0)", () => {
  let container: HTMLDivElement;
  let root: Root;

  beforeEach(() => {
    vi.useFakeTimers();
    mockSync.mockClear();
    registeredListener = null;
    unsubscribeSpy.mockClear();
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

  it("subscribes to sync-queue-change notifications instead of polling, when interval is 0", async () => {
    await render({ auto_sync_enabled: 1, auto_sync_interval: 0 });
    expect(registeredListener).not.toBeNull();
  });

  it("debounces bursts of changes into a single sync call, instead of syncing once per change", async () => {
    await render({ auto_sync_enabled: 1, auto_sync_interval: 0 });

    await act(async () => {
      registeredListener?.();
      registeredListener?.();
      registeredListener?.();
    });

    await act(async () => {
      vi.advanceTimersByTime(2000);
      await Promise.resolve();
    });

    expect(mockSync).toHaveBeenCalledTimes(1);
  });

  it("switches cleanly from instant to interval-based sync when the interval changes from 0 to a positive number", async () => {
    await render({ auto_sync_enabled: 1, auto_sync_interval: 0 });
    expect(registeredListener).not.toBeNull();

    const { SyncIndicator } = await import(
      "@/components/dashboard/sync-indicator"
    );
    mockStoreProfile = { auto_sync_enabled: 1, auto_sync_interval: 10 };
    await act(async () => {
      root.render(React.createElement(SyncIndicator, { collapsed: false }));
    });

    // Old instant-mode listener torn down when switching modes.
    expect(unsubscribeSpy).toHaveBeenCalled();

    mockSync.mockClear();

    await act(async () => {
      vi.advanceTimersByTime(10 * 60 * 1000);
      await Promise.resolve();
    });
    // Fires via the interval timer now, not the (torn-down) instant listener.
    expect(mockSync).toHaveBeenCalledTimes(1);
  });
});
