import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import React, { act } from "react";
import { createRoot, type Root } from "react-dom/client";

(globalThis as any).IS_REACT_ACT_ENVIRONMENT = true;

/**
 * Regression test (A-150): a device that previously linked a different
 * account/store leaves its local data behind - `_sync_queue`, `feedback`,
 * `audit_logs`, etc. A brand-new signup used to insert the new store/user
 * rows straight on top of that leftover data without clearing it first, so
 * the new account's very first sync pushed the old store's stale queued
 * writes under the new account's token, rejected server-side as belonging
 * to a store it doesn't own.
 *
 * The fix must NOT wipe unconditionally: `?tab=setup&step=register` is a
 * documented safe entry point for an already-set-up device (`userCount >
 * 0`, see `app/login/use-login-page.tsx`), reachable from the traditional
 * login screen's "Create account" link - a logged-out owner with real
 * unsynced local work could land here. So a leftover local store routes
 * through the SAME confirm dialog the existing-account store-switch flow
 * already uses (`showConfirmSwitch`/`confirmCloudRestoreSwitch`), rather
 * than wiping silently.
 */

const routerPushMock = vi.fn();
const loginMock = vi.fn(async () => true);
const logoutMock = vi.fn(async () => undefined);
const executeMock = vi.fn(async (_sql: string, _params?: unknown[]) => undefined);
const setActiveStoreIdMock = vi.fn();
const clearDatabaseForNewStoreMock = vi.fn(async () => undefined);

const registerMock = vi.fn();
const getStoresMock = vi.fn(async () => [{ id: "new-store-1", name: "New Store" }]);
const setTokenMock = vi.fn();
const getLocalStoresMock = vi.fn(async () => [] as { id: string; name: string }[]);

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
  syncSubscriptionStatus: vi.fn(async () => ({ success: true, updated: true })),
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
  toast: {
    success: vi.fn(),
    error: vi.fn(),
    warning: vi.fn(),
    info: vi.fn(),
  },
}));

describe("useOnboarding().handleRegister() and a leftover local store", () => {
  let container: HTMLDivElement;
  let root: Root;
  let hookResult: ReturnType<typeof import("@/app/setup/use-onboarding").useOnboarding>;

  const renderRegister = async () => {
    await act(async () => {
      await hookResult.handleRegister(
        "New",
        "Owner",
        "newowner",
        "1234",
        "New Store",
        undefined,
        "newowner@example.com",
        "password123",
      );
    });
  };

  beforeEach(async () => {
    vi.clearAllMocks();
    Object.defineProperty(window, "navigator", {
      value: { ...window.navigator, onLine: true },
      configurable: true,
    });

    registerMock.mockResolvedValue({
      token: "new-token",
      user: { id: "new-user-id" },
    });
    getStoresMock.mockResolvedValue([{ id: "new-store-1", name: "New Store" }]);
    loginMock.mockResolvedValue(true);

    const { useOnboarding } = await import("@/app/setup/use-onboarding");

    function Harness() {
      hookResult = useOnboarding();
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

  it("asks for confirmation instead of wiping silently when the device already has a leftover local store", async () => {
    getLocalStoresMock.mockResolvedValue([{ id: "old-store-1", name: "Old Store" }]);

    await renderRegister();

    expect(hookResult.showConfirmSwitch).toBe(true);
    expect(hookResult.pendingStoreName).toBe("Old Store");
    expect(hookResult.isPendingNewRegistration).toBe(true);
    expect(clearDatabaseForNewStoreMock).not.toHaveBeenCalled();
    expect(executeMock).not.toHaveBeenCalledWith(
      expect.stringContaining("INSERT INTO stores"),
      expect.anything(),
    );
  });

  it("wipes and completes the new account setup only once the user confirms", async () => {
    getLocalStoresMock.mockResolvedValue([{ id: "old-store-1", name: "Old Store" }]);
    await renderRegister();

    await act(async () => {
      await hookResult.confirmCloudRestoreSwitch();
    });

    expect(clearDatabaseForNewStoreMock).toHaveBeenCalledTimes(1);

    // The wipe must happen before the new store/user rows are seeded,
    // not after - otherwise it would delete the rows it just inserted.
    const clearOrder = clearDatabaseForNewStoreMock.mock.invocationCallOrder[0];
    const insertStoreCall = executeMock.mock.calls.findIndex(([sql]) =>
      String(sql).includes("INSERT INTO stores"),
    );
    expect(insertStoreCall).toBeGreaterThanOrEqual(0);
    const insertOrder = executeMock.mock.invocationCallOrder[insertStoreCall];
    expect(clearOrder).toBeLessThan(insertOrder);

    expect(loginMock).toHaveBeenCalledWith("newowner", "1234");
    expect(routerPushMock).toHaveBeenCalledWith("/dashboard");
  });

  it("clears the loading state instead of leaving a stuck spinner if the post-wipe login fails", async () => {
    getLocalStoresMock.mockResolvedValue([{ id: "old-store-1", name: "Old Store" }]);
    await renderRegister();
    loginMock.mockResolvedValue(false);

    await act(async () => {
      await hookResult.confirmCloudRestoreSwitch();
    });

    expect(routerPushMock).not.toHaveBeenCalledWith("/dashboard");
    expect(hookResult.isLoading).toBe(false);
  });

  it("leaves local data untouched and logs out if the user cancels", async () => {
    getLocalStoresMock.mockResolvedValue([{ id: "old-store-1", name: "Old Store" }]);
    await renderRegister();

    await act(async () => {
      await hookResult.cancelCloudRestoreSwitch();
    });

    expect(clearDatabaseForNewStoreMock).not.toHaveBeenCalled();
    expect(executeMock).not.toHaveBeenCalledWith(
      expect.stringContaining("INSERT INTO stores"),
      expect.anything(),
    );
    expect(logoutMock).toHaveBeenCalled();
    expect(hookResult.showConfirmSwitch).toBe(false);
    expect(hookResult.isPendingNewRegistration).toBe(false);
  });

  it("does not wipe or ask for confirmation on a genuinely fresh device with no local store", async () => {
    getLocalStoresMock.mockResolvedValue([]);

    await renderRegister();

    expect(hookResult.showConfirmSwitch).toBe(false);
    expect(clearDatabaseForNewStoreMock).not.toHaveBeenCalled();
    expect(executeMock).toHaveBeenCalledWith(
      expect.stringContaining("INSERT INTO stores"),
      expect.anything(),
    );
    expect(routerPushMock).toHaveBeenCalledWith("/dashboard");
  });
});
