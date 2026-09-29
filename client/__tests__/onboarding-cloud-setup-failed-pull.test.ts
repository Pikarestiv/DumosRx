import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import React, { act } from "react";
import { createRoot, type Root } from "react-dom/client";

// React 19's `act` warns unless the environment explicitly opts in.
(globalThis as any).IS_REACT_ACT_ENVIRONMENT = true;

/**
 * Regression test: a cloud setup whose sync pull FAILED must show the real
 * error and return to the cloud step - never the "no staff accounts were
 * found" empty state, and never a bounce into registration.
 *
 * pullChanges() fires onCriticalTablesReady from a `finally`, so the
 * callback also runs when the pull threw and nothing at all was written
 * (the page-1 transaction, which carries stores AND users, rolls back as a
 * unit). Onboarding used to treat that signal as "identity is ready",
 * count zero local users and report a genuinely-failed sync as an empty
 * store. The callback now carries whether the pull succeeded.
 */

const routerPushMock = vi.fn();
const loginMock = vi.fn(async () => true);
const linkCloudAccountMock = vi.fn(async () => ({ success: true, message: "" }));
const getStoresMock = vi.fn(async () => [{ id: "store-1", name: "Store One" }]);
const getTotalUserCountMock = vi.fn(async () => 0);
const syncMock =
  vi.fn<
    (
      isManual?: boolean,
      isSetup?: boolean,
      onCriticalTablesReady?: (pullSucceeded: boolean) => void,
    ) => Promise<{ success: boolean; error?: string }>
  >();

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: routerPushMock }),
  useSearchParams: () => new URLSearchParams("tab=setup&step=syncing"),
}));

vi.mock("@/lib/context/auth-context", () => ({
  useAuth: () => ({
    login: loginMock,
    linkCloudAccount: linkCloudAccountMock,
    isCloudLinked: true,
    logout: vi.fn(),
  }),
}));

vi.mock("@/lib/db/core", () => ({
  generateId: vi.fn(() => "fake-id"),
  execute: vi.fn(async () => undefined),
  setActiveStoreId: vi.fn(),
  restoreDatabase: vi.fn(async () => undefined),
  clearDatabaseForNewStore: vi.fn(async () => undefined),
}));

vi.mock("@/lib/db/queries/setup", () => ({
  getTotalUserCount: () => getTotalUserCountMock(),
  getLocalStores: vi.fn(async () => []),
}));

vi.mock("@/lib/db/sync-engine", () => ({
  sync: (...args: unknown[]) => (syncMock as any)(...args),
}));

vi.mock("@/lib/api/client", () => ({
  apiClient: {
    register: vi.fn(),
    getProfile: vi.fn(async () => ({})),
    getStores: () => getStoresMock(),
    setToken: vi.fn(),
  },
}));

const toastErrorMock = vi.fn();
const toastWarningMock = vi.fn();
const toastSuccessMock = vi.fn();

vi.mock("sonner", () => ({
  toast: {
    success: (...a: unknown[]) => toastSuccessMock(...a),
    error: (...a: unknown[]) => toastErrorMock(...a),
    warning: (...a: unknown[]) => toastWarningMock(...a),
    info: vi.fn(),
  },
}));

const pushedSteps = () =>
  routerPushMock.mock.calls.map((c) => String(c[0]));

describe("useOnboarding() cloud setup when the identity pull fails", () => {
  let container: HTMLDivElement;
  let root: Root;
  let hookResult: ReturnType<typeof import("@/app/setup/use-onboarding").useOnboarding>;

  beforeEach(async () => {
    vi.clearAllMocks();
    vi.useRealTimers();
    getTotalUserCountMock.mockResolvedValue(0);
    linkCloudAccountMock.mockResolvedValue({ success: true, message: "" });
    getStoresMock.mockResolvedValue([{ id: "store-1", name: "Store One" }]);

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

  it("shows the real sync error and returns to the cloud step instead of reporting 'no staff accounts'", async () => {
    syncMock.mockImplementation(async (_isManual, _isSetup, onCriticalTablesReady) => {
      onCriticalTablesReady?.(false);
      return { success: false, error: "no such table: permission_groups" };
    });

    await act(async () => {
      await hookResult.handleCloudRestore("owner@example.com", "secret");
      await new Promise((r) => setTimeout(r, 3500));
    });

    expect(toastErrorMock).toHaveBeenCalledWith(
      expect.stringContaining("no such table: permission_groups"),
    );
    expect(toastWarningMock).not.toHaveBeenCalled();
    expect(pushedSteps().some((u) => u.includes("step=register"))).toBe(false);
    expect(pushedSteps().some((u) => u.includes("step=cloud"))).toBe(true);
    expect(loginMock).not.toHaveBeenCalled();
  });

  it("still reports 'no staff accounts' and routes to registration when the pull genuinely succeeded with zero users", async () => {
    syncMock.mockImplementation(async (_isManual, _isSetup, onCriticalTablesReady) => {
      onCriticalTablesReady?.(true);
      return { success: true };
    });

    await act(async () => {
      await hookResult.handleCloudRestore("owner@example.com", "secret");
      await new Promise((r) => setTimeout(r, 3500));
    });

    expect(toastWarningMock).toHaveBeenCalledWith(
      expect.stringContaining("no staff accounts were found"),
    );
    expect(pushedSteps().some((u) => u.includes("step=register"))).toBe(true);
  });

  it("logs the user in when the pull succeeded and staff exist", async () => {
    getTotalUserCountMock.mockResolvedValue(3);
    syncMock.mockImplementation(async (_isManual, _isSetup, onCriticalTablesReady) => {
      onCriticalTablesReady?.(true);
      return { success: true };
    });

    await act(async () => {
      await hookResult.handleCloudRestore("owner@example.com", "secret");
      await new Promise((r) => setTimeout(r, 3500));
    });

    expect(toastWarningMock).not.toHaveBeenCalled();
    expect(pushedSteps().some((u) => u.includes("step=register"))).toBe(false);
  });
});
