import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import React, { act } from "react";
import { createRoot, type Root } from "react-dom/client";

(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

// Regression test (A-156, docs/FIXED_BUGS.md):
// Rationale: docs/CLIENT_COMMENTS.md#block-__tests__-onboarding-seeds-subscription-status-test-ts-L7

const routerPushMock = vi.fn();
const loginMock = vi.fn(() => Promise.resolve(true));
const executeMock = vi.fn((_sql: string, _params?: unknown[]) => Promise.resolve(undefined));
const setActiveStoreIdMock = vi.fn();
const getLocalStoresMock = vi.fn(() => Promise.resolve([] as { id: string; name: string }[]));
const syncSubscriptionStatusMock = vi.fn();
const syncMock = vi.fn((..._args: unknown[]) => Promise.resolve({ success: true }));

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
  restoreDatabase: vi.fn(() => Promise.resolve(undefined)),
  clearDatabaseForNewStore: vi.fn(() => Promise.resolve(undefined)),
}));

vi.mock("@/lib/db/queries/setup", () => ({
  getTotalUserCount: vi.fn(() => Promise.resolve(0)),
  getLocalStores: () => getLocalStoresMock(),
}));

vi.mock("@/lib/db/sync-engine", () => ({
  sync: (...a: unknown[]) => syncMock(...a),
  syncSubscriptionStatus: () => syncSubscriptionStatusMock(),
}));

vi.mock("@/lib/api/client", () => ({
  apiClient: {
    register: vi.fn(() => Promise.resolve({ token: "new-token", user: { id: "new-user-id" } })),
    login: vi.fn(),
    getProfile: vi.fn(() => Promise.resolve({})),
    getStores: vi.fn(() => Promise.resolve([{ id: "new-store-1", name: "New Store" }])),
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

  it("waits for subscription status synchronization before routing to dashboard", async () => {
    let resolveSubscription!: (value: { success: boolean; updated: boolean }) => void;
    syncSubscriptionStatusMock.mockImplementation(
      () =>
        new Promise<{ success: boolean; updated: boolean }>((resolve) => {
          resolveSubscription = resolve;
        })
    );

    let registerResolved = false;
    let registerPromise: Promise<void>;
    act(() => {
      registerPromise = hookResult.handleRegister(
        "New", "Owner", "newowner", "1234", "New Store",
        undefined, "newowner@example.com", "password123",
      ).then(() => {
        registerResolved = true;
      });
    });

    await new Promise((resolve) => setTimeout(resolve, 0));

    expect(syncSubscriptionStatusMock).toHaveBeenCalledTimes(1);
    expect(routerPushMock).not.toHaveBeenCalled();
    expect(registerResolved).toBe(false);

    await act(async () => {
      resolveSubscription({ success: true, updated: true });
      await registerPromise;
    });

    expect(registerResolved).toBe(true);
    expect(routerPushMock).toHaveBeenCalledWith("/dashboard");
  });

  it("doesn't block account creation if the status fetch fails", async () => {
    syncSubscriptionStatusMock.mockRejectedValue(new Error("network down"));

    await renderRegister();

    expect(routerPushMock).toHaveBeenCalledWith("/dashboard");
  });
});
