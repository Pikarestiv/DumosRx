import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import React, { act } from "react";
import { createRoot, type Root } from "react-dom/client";

(globalThis as any).IS_REACT_ACT_ENVIRONMENT = true;

// jsdom doesn't implement matchMedia; components/ui/tooltip.tsx's touch
// detection needs it to exist to mount at all. Same stub as
// sync-indicator-instant-sync.test.ts.
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

let registeredListener: ((tables: string[]) => void) | null = null;
vi.mock("@/lib/db/core", () => ({
  addSyncQueueChangeListener: vi.fn((fn: (tables: string[]) => void) => {
    registeredListener = fn;
    return () => {
      registeredListener = null;
    };
  }),
}));

vi.mock("@/components/dashboard/auth-modal", () => ({
  AuthModal: () => null,
}));

const toastInfo = vi.fn();
vi.mock("sonner", () => ({
  toast: { success: vi.fn(), error: vi.fn(), info: toastInfo },
}));

vi.mock("@/lib/query-keys", () => ({
  queryKeys: { sync: { queueCount: () => ({ queryKey: ["syncQueueCount"] }) } },
}));

vi.mock("@/lib/context/store-context", () => ({
  useStore: () => ({ storeProfile: { auto_sync_enabled: 1, auto_sync_interval: 0 } }),
}));

let mockIsImpersonating = false;
vi.mock("@/lib/context/auth-context", () => ({
  useAuth: () => ({ isImpersonating: mockIsImpersonating }),
}));

vi.mock("@/lib/db/DatabaseProvider", () => ({
  useDatabase: () => ({ isReadOnlyTab: false }),
}));

/**
 * Companion to sync-blocked-during-impersonation.test.ts: sync() itself is
 * the real gate, but the indicator must SAY so rather than silently doing
 * nothing — otherwise a superadmin just sees a frozen "Cloud Active" badge
 * and an inert refresh button.
 */
describe("SyncIndicator during an impersonated session", () => {
  let container: HTMLDivElement;
  let root: Root;

  beforeEach(() => {
    vi.useFakeTimers();
    mockSync.mockClear();
    toastInfo.mockClear();
    registeredListener = null;
    container = document.createElement("div");
    document.body.appendChild(container);
    localStorage.setItem("auth_token", "test-token");
  });

  afterEach(() => {
    act(() => root?.unmount());
    container.remove();
    localStorage.clear();
    vi.useRealTimers();
  });

  async function render(isImpersonating: boolean) {
    mockIsImpersonating = isImpersonating;
    const { SyncIndicator } = await import(
      "@/components/dashboard/sync-indicator"
    );
    root = createRoot(container);
    await act(async () => {
      root.render(React.createElement(SyncIndicator, { collapsed: false }));
    });
  }

  it("reports sync as disabled instead of showing a normal cloud status", async () => {
    await render(true);
    expect(container.textContent).toContain("Sync Disabled");
  });

  it("disables the manual Sync Now button", async () => {
    await render(true);
    const button = container.querySelector<HTMLButtonElement>(
      '[data-testid="sync-now-button"]',
    );
    expect(button).not.toBeNull();
    expect(button!.disabled).toBe(true);
  });

  it("never installs the auto-sync daemon, so no background sync can fire", async () => {
    await render(true);
    // auto_sync_interval === 0 would normally subscribe to sync-queue changes.
    expect(registeredListener).toBeNull();

    await act(async () => {
      vi.advanceTimersByTime(60 * 60 * 1000);
      await Promise.resolve();
    });
    expect(mockSync).not.toHaveBeenCalled();
  });

  it("explains itself (toast) rather than silently ignoring a click on the card", async () => {
    await render(true);
    const card = container.querySelector("#tour-sync-indicator") as HTMLElement;
    await act(async () => {
      card.click();
    });
    expect(mockSync).not.toHaveBeenCalled();
    expect(toastInfo).toHaveBeenCalled();
  });

  it("leaves a normal (non-impersonated) session fully syncing — no regression", async () => {
    await render(false);
    expect(container.textContent).not.toContain("Sync Disabled");

    const button = container.querySelector<HTMLButtonElement>(
      '[data-testid="sync-now-button"]',
    );
    expect(button!.disabled).toBe(false);

    expect(registeredListener).not.toBeNull();
    await act(async () => {
      registeredListener?.(["products"]);
    });
    await act(async () => {
      vi.advanceTimersByTime(2000);
      await Promise.resolve();
    });
    expect(mockSync).toHaveBeenCalledTimes(1);
  });
});
