import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import React, { act } from "react";
import { createRoot, type Root } from "react-dom/client";

(globalThis as any).IS_REACT_ACT_ENVIRONMENT = true;

/**
 * Regression test (A-154, docs/FIXED_BUGS.md): /login's setup/login tabs
 * share one mounted page instance across the whole register -> confirm-wipe
 * -> new-account flow (no remount). useDeviceAuthStatus() used to read
 * userCount/recentUsers only once, on that instance's first mount - before
 * clearDatabaseForNewStore() ever ran - so a later bounce back to /login
 * (e.g. dashboard-layout's `!user` guard) rendered the stale pre-wipe
 * account instead of the new one. Fixed by having useOnboarding() call an
 * injected refetch callback right after the wipe and right after login.
 */

const routerPushMock = vi.fn();
const loginMock = vi.fn(async () => true);
const logoutMock = vi.fn(async () => undefined);
const executeMock = vi.fn(async (_sql: string, _params?: unknown[]) => undefined);
const setActiveStoreIdMock = vi.fn();
const clearDatabaseForNewStoreMock = vi.fn(async () => undefined);
const onDeviceDataChangedMock = vi.fn();

const registerMock = vi.fn();
const getStoresMock = vi.fn(async () => [{ id: "new-store-1", name: "New Store" }]);
const setTokenMock = vi.fn();
const getLocalStoresMock = vi.fn(async () => [{ id: "old-store-1", name: "Old Store" }]);

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: routerPushMock }),
  useSearchParams: () => new URLSearchParams("tab=setup&step=register"),
}));

vi.mock("@/lib/context/auth-context", () => ({
  useAuth: () => ({
    login: loginMock,
    linkCloudAccount: vi.fn(),
    isCloudLinked: false,
    logout: logoutMock,
  }),
}));

vi.mock("@/lib/db/core", () => ({
  registerInvalidateTablesFn: vi.fn(),
  generateId: vi.fn(() => "fake-id"),
  execute: executeMock,
  setActiveStoreId: setActiveStoreIdMock,
  restoreDatabase: vi.fn(async () => undefined),
  clearDatabaseForNewStore: clearDatabaseForNewStoreMock,
}));

vi.mock("@/lib/db/queries/setup", () => ({
  getTotalUserCount: vi.fn(async () => 0),
  getLocalStores: () => getLocalStoresMock(),
}));

vi.mock("@/lib/db/sync-engine", () => ({
  sync: vi.fn(async () => ({ success: true })),
}));

vi.mock("@/lib/api/client", () => ({
  apiClient: {
    register: (...a: unknown[]) => registerMock(...a),
    login: vi.fn(),
    getProfile: vi.fn(async () => ({})),
    getStores: () => getStoresMock(),
    setToken: (...a: unknown[]) => setTokenMock(...a),
  },
}));

vi.mock("sonner", () => ({
  toast: { success: vi.fn(), error: vi.fn(), warning: vi.fn(), info: vi.fn() },
}));

describe("useOnboarding(onDeviceDataChanged)", () => {
  let container: HTMLDivElement;
  let root: Root;
  let hookResult: ReturnType<typeof import("@/app/setup/use-onboarding").useOnboarding>;

  beforeEach(async () => {
    vi.clearAllMocks();
    Object.defineProperty(window, "navigator", {
      value: { ...window.navigator, onLine: true },
      configurable: true,
    });

    registerMock.mockResolvedValue({ token: "new-token", user: { id: "new-user-id" } });
    getStoresMock.mockResolvedValue([{ id: "new-store-1", name: "New Store" }]);
    loginMock.mockResolvedValue(true);

    const { useOnboarding } = await import("@/app/setup/use-onboarding");

    function Harness() {
      hookResult = useOnboarding(onDeviceDataChangedMock);
      return null;
    }

    container = document.createElement("div");
    document.body.appendChild(container);
    root = createRoot(container);
    act(() => {
      root.render(React.createElement(Harness));
    });
  });

  afterEach(() => {
    act(() => {
      root.unmount();
    });
    container.remove();
  });

  it("refetches device auth status after the wipe and after the post-wipe login succeed", async () => {
    await act(async () => {
      await hookResult.handleRegister(
        "New", "Owner", "newowner", "1234", "New Store",
        undefined, "newowner@example.com", "password123",
      );
    });

    expect(onDeviceDataChangedMock).not.toHaveBeenCalled();

    await act(async () => {
      await hookResult.confirmCloudRestoreSwitch();
    });

    expect(clearDatabaseForNewStoreMock).toHaveBeenCalledTimes(1);
    expect(onDeviceDataChangedMock).toHaveBeenCalledTimes(2);

    const wipeOrder = clearDatabaseForNewStoreMock.mock.invocationCallOrder[0];
    const firstRefetchOrder = onDeviceDataChangedMock.mock.invocationCallOrder[0];
    const loginOrder = loginMock.mock.invocationCallOrder[0];
    const secondRefetchOrder = onDeviceDataChangedMock.mock.invocationCallOrder[1];

    // Refetches straddle both staleness windows: right after the wipe (so a
    // bounce-to-/login before login() resolves sees userCount=0, not the old
    // account) and right after login() (so it sees the new account).
    expect(wipeOrder).toBeLessThan(firstRefetchOrder);
    expect(firstRefetchOrder).toBeLessThan(loginOrder);
    expect(loginOrder).toBeLessThan(secondRefetchOrder);
  });
});
