import { describe, it, expect, beforeEach, vi } from "vitest";
import React, { act } from "react";
import { createRoot, type Root } from "react-dom/client";

// React 19's `act` warns unless the environment explicitly opts in.
// See __tests__/use-pos-payment-loyalty-gate.test.ts for the same harness
// pattern (no @testing-library/react is installed in this repo).
(globalThis as any).IS_REACT_ACT_ENVIRONMENT = true;

/**
 * Regression test for known bug #10, Part A (docs/features/_known-bugs.md):
 * handleLocalRestore() used to call restoreDatabase() then a client-side
 * router.push("/login"), which resolves before /login's account-detection
 * (useDeviceAuthStatus) re-runs against the newly-restored database - a real
 * walkthrough saw the stale pre-restore "No Local Accounts Found" screen
 * flash right after the "Database restored successfully!" toast.
 *
 * The fix matches the pattern already used by the other restore paths in
 * this codebase (hooks/use-settings-sync.ts's handleRestoreBackup /
 * handleRestoreBackupTauri): force a full browser navigation instead of a
 * client-side one, so no stale React state can be observed after a restore.
 */

const routerPushMock = vi.fn();
const restoreDatabaseMock = vi.fn(async (_bytes: Uint8Array) => undefined);

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: routerPushMock }),
  useSearchParams: () => new URLSearchParams(),
}));

vi.mock("@/lib/context/auth-context", () => ({
  useAuth: () => ({
    login: vi.fn(),
    linkCloudAccount: vi.fn(),
    isCloudLinked: false,
    logout: vi.fn(),
  }),
}));

vi.mock("@/lib/db/core", () => ({
  generateId: vi.fn(() => "fake-id"),
  execute: vi.fn(async () => undefined),
  restoreDatabase: (arg: Uint8Array) => restoreDatabaseMock(arg),
  clearDatabaseForNewStore: vi.fn(async () => undefined),
}));

vi.mock("@/lib/db/queries/setup", () => ({
  getTotalUserCount: vi.fn(async () => 0),
  getLocalStores: vi.fn(async () => []),
}));

vi.mock("@/lib/db/sync-engine", () => ({
  sync: vi.fn(async () => ({ success: true })),
}));

vi.mock("@/lib/api/client", () => ({
  apiClient: {
    register: vi.fn(),
    getProfile: vi.fn(),
    getStores: vi.fn(),
    setToken: vi.fn(),
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

describe("useOnboarding().handleLocalRestore", () => {
  let container: HTMLDivElement;
  let root: Root;
  let hookResult: ReturnType<typeof import("@/app/setup/use-onboarding").useOnboarding>;
  let hrefSetterMock: ReturnType<typeof vi.fn<(v: string) => void>>;

  beforeEach(async () => {
    vi.clearAllMocks();
    vi.useRealTimers();

    // jsdom's real window.location throws "not implemented" on assignment;
    // replace it with a plain object whose href setter we can assert on,
    // the same way a full browser navigation would be observed from here.
    hrefSetterMock = vi.fn<(v: string) => void>();
    const fakeLocation: { _href: string; reload: ReturnType<typeof vi.fn> } = {
      _href: "http://localhost/login?tab=setup&step=backup",
      reload: vi.fn(),
    };
    const fakeLocationObj = {};
    Object.defineProperties(fakeLocationObj, {
      href: {
        get: () => fakeLocation._href,
        set: (v: string) => {
          hrefSetterMock(v);
          fakeLocation._href = v;
        },
      },
      reload: { value: fakeLocation.reload },
    });
    Object.defineProperty(window, "location", {
      configurable: true,
      value: fakeLocationObj,
    });

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

  it("does a full navigation to /login instead of a client-side router.push after a successful restore", async () => {
    const file = new File([new Uint8Array([1, 2, 3])], "backup.drx");

    await act(async () => {
      await hookResult.handleLocalRestore(file);
      // handleLocalRestore delays the navigation slightly (matching
      // use-settings-sync's toast-then-reload timing) - flush it.
      await new Promise((r) => setTimeout(r, 1100));
    });

    expect(restoreDatabaseMock).toHaveBeenCalledTimes(1);

    // The bug: a client-side-only navigation that leaves stale React state
    // (useDeviceAuthStatus) unrefreshed.
    expect(routerPushMock).not.toHaveBeenCalledWith("/login");

    // The fix: a full browser navigation to /login, so /login's
    // account-detection re-runs against the freshly restored database.
    expect(hrefSetterMock).toHaveBeenCalledWith("/login");
  });
});
