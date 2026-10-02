import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import React, { act } from "react";
import { createRoot, type Root } from "react-dom/client";

(globalThis as any).IS_REACT_ACT_ENVIRONMENT = true;

/**
 * Regression test (A-156, docs/FIXED_BUGS.md): a brand-new signup's trial
 * subscription is created server-side in the same request as the account,
 * but the local `stores` row's `subscription_tier` column has no value in
 * finishNewAccountSetup()'s INSERT, so it sat at the schema default 'free'
 * until the fire-and-forget `sync(false, true)` call eventually pulled the
 * real value - landing the user on the dashboard with "Free" shown even
 * though the server already granted a Pro trial in the same request.
 */

const routerPushMock = vi.fn();
const loginMock = vi.fn(async () => true);
const executeMock = vi.fn(async (_sql: string, _params?: unknown[]) => undefined);
const setActiveStoreIdMock = vi.fn();
const getLocalStoresMock = vi.fn(async () => [] as { id: string; name: string }[]);
const syncSubscriptionStatusMock = vi.fn();
const syncMock = vi.fn(async (..._args: unknown[]) => ({ success: true }));

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: routerPushMock }),
  useSearchParams: () => new URLSearchParams("tab=setup&step=register"),
}));

vi.mock("@/lib/context/auth-context", () => ({
  useAuth: () => ({
    login: loginMock,
    linkCloudAccount: vi.fn(),
    isCloudLinked: false,
    logout: vi.fn(),
  }),
}));

vi.mock("@/lib/db/core", () => ({
  generateId: vi.fn(() => "fake-id"),
  execute: executeMock,
  setActiveStoreId: setActiveStoreIdMock,
  restoreDatabase: vi.fn(async () => undefined),
  clearDatabaseForNewStore: vi.fn(async () => undefined),
}));

vi.mock("@/lib/db/queries/setup", () => ({
  getTotalUserCount: vi.fn(async () => 0),
  getLocalStores: () => getLocalStoresMock(),
}));

vi.mock("@/lib/db/sync-engine", () => ({
  sync: (...a: unknown[]) => syncMock(...a),
  syncSubscriptionStatus: () => syncSubscriptionStatusMock(),
}));

vi.mock("@/lib/api/client", () => ({
  apiClient: {
    register: vi.fn(async () => ({ token: "new-token", user: { id: "new-user-id" } })),
    login: vi.fn(),
    getProfile: vi.fn(async () => ({})),
    getStores: vi.fn(async () => [{ id: "new-store-1", name: "New Store" }]),
    setToken: vi.fn(),
  },
}));

vi.mock("sonner", () => ({
  toast: { success: vi.fn(), error: vi.fn(), warning: vi.fn(), info: vi.fn() },
}));

describe("useOnboarding().handleRegister() seeding the initial subscription status", () => {
  let container: HTMLDivElement;
  let root: Root;
  let hookResult: ReturnType<typeof import("@/app/setup/use-onboarding").useOnboarding>;

  const renderRegister = () =>
    act(async () => {
      await hookResult.handleRegister(
        "New", "Owner", "newowner", "1234", "New Store",
        undefined, "newowner@example.com", "password123",
      );
    });

  beforeEach(async () => {
    vi.clearAllMocks();
    Object.defineProperty(window, "navigator", {
      value: { ...window.navigator, onLine: true },
      configurable: true,
    });
    getLocalStoresMock.mockResolvedValue([]);
    loginMock.mockResolvedValue(true);
    syncSubscriptionStatusMock.mockResolvedValue({ success: true, updated: true });

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

  it("fetches the real subscription status before routing to the dashboard, not just the fire-and-forget sync()", async () => {
    await renderRegister();

    expect(syncSubscriptionStatusMock).toHaveBeenCalledTimes(1);
    const statusOrder = syncSubscriptionStatusMock.mock.invocationCallOrder[0];
    const routeOrder = routerPushMock.mock.invocationCallOrder[0];
    expect(statusOrder).toBeLessThan(routeOrder);
  });

  it("doesn't block account creation if the status fetch fails", async () => {
    syncSubscriptionStatusMock.mockRejectedValue(new Error("network down"));

    await renderRegister();

    expect(routerPushMock).toHaveBeenCalledWith("/dashboard");
  });
});
