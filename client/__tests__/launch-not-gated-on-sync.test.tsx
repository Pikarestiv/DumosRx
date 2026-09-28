import { describe, it, expect, beforeAll, beforeEach, vi } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import initSqlJs, { type Database } from "sql.js";
import React from "react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";

/**
 * A-7 (docs/KNOWN_BUGS.md): every online launch was gated behind a full
 * push+pull round. LicenseGuard's performCheck() awaited
 * `Promise.race([sync(true), 5 s timeout])` while rendering <SplashScreen/>,
 * so first paint cost up to five seconds on a slow or captive-portal
 * network — and the effect's storeProfile dependencies re-fired it as the
 * profile settled, firing a second sync(true). StoreProvider fired a third
 * sync() of its own on mount.
 *
 * The app must paint from local state immediately, and the launch sync must
 * have exactly one owner.
 */

vi.mock("@sentry/nextjs", () => ({
  setUser: vi.fn(),
  setTag: vi.fn(),
}));

vi.mock("@/lib/api/client", () => ({
  apiClient: { login: vi.fn(), setToken: vi.fn() },
}));

const syncMock = vi.fn();
const syncSubscriptionStatusMock = vi.fn(async () => ({ updated: false }));
vi.mock("@/lib/db/sync-engine", () => ({
  sync: (...args: unknown[]) => syncMock(...args),
  isSyncing: vi.fn(() => false),
  syncSubscriptionStatus: () => syncSubscriptionStatusMock(),
}));

vi.mock("@/lib/db/sync-engine/health-check", () => ({
  checkSyncHealth: vi.fn(async () => {}),
}));

vi.mock("@/lib/query-client", () => ({
  queryClient: { cancelQueries: vi.fn(async () => {}), clear: vi.fn() },
}));

vi.mock("@/lib/db", () => ({
  isTauri: vi.fn(() => false),
}));

vi.mock("@/lib/api/token-manager", () => ({
  getToken: vi.fn(() => "token-abc"),
}));

vi.mock("@/lib/native/widget-bridge", () => ({
  mirrorAuthToken: vi.fn(async () => {}),
  clearMirroredAuthToken: vi.fn(async () => {}),
  writeWidgetSnapshot: vi.fn(async () => {}),
  requestPinWidget: vi.fn(async () => {}),
}));

vi.mock("idb-keyval", () => ({
  get: vi.fn(async () => undefined),
  set: vi.fn(async () => undefined),
}));

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn(), replace: vi.fn(), prefetch: vi.fn() }),
  useSearchParams: () => new URLSearchParams(),
  usePathname: () => "/dashboard",
}));

vi.mock("@/components/theme-provider", () => ({
  useTheme: () => ({ theme: "light", setTheme: vi.fn() }),
}));

vi.mock("@/lib/hooks/use-feature-gate", () => ({
  useFeatureGate: () => ({ currentTier: "pro", canUseMobileApp: true }),
}));

vi.mock("@/lib/hooks/use-auto-lock", () => ({
  useAutoLockStore: (selector: (s: { isLocked: boolean }) => unknown) =>
    selector({ isLocked: false }),
}));

vi.mock("@/lib/utils/device-id", () => ({
  getDeviceId: () => "DUMOS-TEST-0001",
}));

const checkLicenseStatusMock = vi.fn(async () => ({
  isValid: true,
  isClockTampered: false,
  isSuspended: false,
  message: "Licensed",
  tier: "pro",
  isTrial: false,
  expiryDate: null,
}));
vi.mock("@/lib/licensing/licensing-manager", () => ({
  checkLicenseStatus: () => checkLicenseStatusMock(),
}));

describe("app launch is not gated on a network sync", () => {
  let db: Database;
  let core: typeof import("@/lib/db/core");
  let StoreProvider: typeof import("@/lib/context/store-context").StoreProvider;
  let AuthProvider: typeof import("@/lib/context/auth-context").AuthProvider;
  let LicenseGuard: typeof import("@/components/auth/license-guard").LicenseGuard;

  beforeAll(async () => {
    core = await import("@/lib/db/core");
    ({ AuthProvider } = await import("@/lib/context/auth-context"));
    ({ StoreProvider } = await import("@/lib/context/store-context"));
    ({ LicenseGuard } = await import("@/components/auth/license-guard"));

    const { SCHEMA_SQL } = await import("@/lib/db/schema");
    const SQL = await initSqlJs({
      locateFile: () => require.resolve("sql.js/dist/sql-wasm.wasm"),
    });
    db = new SQL.Database();
    db.run(SCHEMA_SQL);
    core.__setDatabaseForTesting(db);
  });

  beforeEach(() => {
    db.run(`DELETE FROM stores; DELETE FROM users;`);
    db.run(
      `INSERT INTO stores (id, name, status, subscription_tier, is_initialized) VALUES ('store-a', 'Store A', 'active', 'pro', 1)`,
    );
    localStorage.clear();
    sessionStorage.clear();
    localStorage.setItem("auth_token", "token-abc");
    localStorage.setItem("dumos_active_store_id", "store-a");
    core.setCurrentUser(null);
    core.setActiveStoreId(null);
    vi.clearAllMocks();
    syncSubscriptionStatusMock.mockResolvedValue({ updated: false });
  });

  function Tree({ children }: { children: React.ReactNode }) {
    const queryClient = new QueryClient({
      defaultOptions: { queries: { retry: false, gcTime: 0 } },
    });
    return React.createElement(
      QueryClientProvider,
      { client: queryClient },
      React.createElement(
        AuthProvider,
        null,
        React.createElement(
          StoreProvider,
          null,
          React.createElement(LicenseGuard, null, children),
        ),
      ),
    );
  }

  it("paints the app without waiting for sync() to resolve", async () => {
    // A sync that never settles — the captive-portal case the 5 s race in
    // performCheck() existed to bound. First paint must not depend on it.
    syncMock.mockImplementation(() => new Promise(() => {}));

    render(
      React.createElement(Tree, null, React.createElement("div", null, "app content")),
    );

    await waitFor(() => expect(screen.queryByText("app content")).not.toBeNull());
    expect(screen.queryByText("Initializing workspace...")).toBeNull();
  });

  it("fires exactly one mount-time sync for the whole launch", async () => {
    syncMock.mockResolvedValue({ success: true });

    render(
      React.createElement(Tree, null, React.createElement("div", null, "app content")),
    );

    await waitFor(() => expect(screen.queryByText("app content")).not.toBeNull());
    await waitFor(() => expect(syncMock).toHaveBeenCalled());

    // Let the storeProfile query settle and re-render the guard, which is
    // what used to fire performCheck()'s second sync(true).
    await new Promise((resolve) => setTimeout(resolve, 50));

    expect(syncMock).toHaveBeenCalledTimes(1);
  });

  it("still re-evaluates the license after the background sync lands", async () => {
    syncMock.mockResolvedValue({ success: true });

    render(
      React.createElement(Tree, null, React.createElement("div", null, "app content")),
    );

    await waitFor(() => expect(screen.queryByText("app content")).not.toBeNull());
    const afterPaint = checkLicenseStatusMock.mock.calls.length;

    window.dispatchEvent(new CustomEvent("dumos_sync_completed"));

    await waitFor(() =>
      expect(checkLicenseStatusMock.mock.calls.length).toBeGreaterThan(afterPaint),
    );
  });
});
