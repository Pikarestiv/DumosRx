import { describe, it, expect, beforeAll, beforeEach, vi } from "vitest";
import { renderHook, waitFor, act } from "@testing-library/react";
import initSqlJs, { type Database } from "sql.js";
import React from "react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";

// Regression coverage for the Critical bug in docs/KNOWN_BUGS.md / FIXED_BUGS.md:
// Rationale: docs/CLIENT_COMMENTS.md#block-__tests__-store-context-switch-clears-cache-test-tsx-L7

vi.mock("@sentry/nextjs", () => ({
  setUser: vi.fn(),
  setTag: vi.fn(),
}));

vi.mock("@/lib/api/client", () => ({
  apiClient: { login: vi.fn(), setToken: vi.fn() },
}));

vi.mock("@/lib/db/sync-engine", () => ({
  sync: vi.fn(async () => ({ success: true })),
  isSyncing: vi.fn(() => false),
}));

const cancelQueries = vi.fn(async (..._args: unknown[]) => {});
const invalidateQueries = vi.fn(async (..._args: unknown[]) => {});
const clear = vi.fn();

vi.mock("@/lib/query-client", () => ({
  queryClient: {
    cancelQueries: (...args: unknown[]) => cancelQueries(...args),
    invalidateQueries: (...args: unknown[]) => invalidateQueries(...args),
    clear: (...args: unknown[]) => clear(...args),
  },
}));

vi.mock("@/lib/db", () => ({
  isTauri: vi.fn(() => false),
}));

vi.mock("@/lib/api/token-manager", () => ({
  getToken: vi.fn(() => null),
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
  usePathname: () => "/",
}));

describe("store-context switchStore clears the query cache", () => {
  let db: Database;
  let core: typeof import("@/lib/db/core");
  let useStore: typeof import("@/lib/context/store-context").useStore;
  let StoreProvider: typeof import("@/lib/context/store-context").StoreProvider;
  let AuthProvider: typeof import("@/lib/context/auth-context").AuthProvider;

  beforeAll(async () => {
    core = await import("@/lib/db/core");
    const authContext = await import("@/lib/context/auth-context");
    AuthProvider = authContext.AuthProvider;
    const storeContext = await import("@/lib/context/store-context");
    useStore = storeContext.useStore;
    StoreProvider = storeContext.StoreProvider;

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
    localStorage.clear();
    sessionStorage.clear();
    core.setCurrentUser(null);
    core.setActiveStoreId(null);
    cancelQueries.mockClear();
    invalidateQueries.mockClear();
    clear.mockClear();
  });

  function wrapper({ children }: { children: React.ReactNode }) {
    const queryClient = new QueryClient({
      defaultOptions: { queries: { retry: false } },
    });
    return React.createElement(
      QueryClientProvider,
      { client: queryClient },
      React.createElement(AuthProvider, null, React.createElement(StoreProvider, null, children)),
    );
  }

  it("clears the cache (not invalidateQueries) after switching, and never leaves isSwitchingStore stuck", async () => {
    db.run(`INSERT INTO stores (id, name) VALUES ('store-a', 'Store A'), ('store-b', 'Store B')`);
    localStorage.setItem("dumos_active_store_id", "store-a");

    const { result } = renderHook(() => useStore(), { wrapper });

    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.isSwitchingStore).toBe(false);

    act(() => {
      result.current.switchStore("store-b");
    });

    // isSwitchingStore flips true synchronously (so LicenseGuard shows the
    // splash instead of a mid-transition frame).
    expect(result.current.isSwitchingStore).toBe(true);

    await waitFor(() => expect(result.current.isSwitchingStore).toBe(false));

    // The cache must be cleared outright - not merely invalidated, which (with zero mounted observers at the moment it runs) w…
    // Rationale: docs/CLIENT_COMMENTS.md#line-__tests__-store-context-switch-clears-cache-test-tsx-L151
    expect(clear).toHaveBeenCalled();
    expect(invalidateQueries).not.toHaveBeenCalled();

    // cancelQueries() must run before clear(), so an in-flight request from the outgoing store can't resolve after the cache h…
    // Rationale: docs/CLIENT_COMMENTS.md#line-__tests__-store-context-switch-clears-cache-test-tsx-L158
    const cancelOrder = cancelQueries.mock.invocationCallOrder[0];
    const clearOrder = clear.mock.invocationCallOrder[0];
    expect(cancelOrder).toBeLessThan(clearOrder);

    expect(core.getActiveStoreId()).toBe("store-b");
    expect(localStorage.getItem("dumos_active_store_id")).toBe("store-b");
  });

  it("still clears the cache and releases the splash even if cancelQueries() never settles", async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    try {
      db.run(`INSERT INTO stores (id, name) VALUES ('store-a', 'Store A'), ('store-b', 'Store B')`);
      localStorage.setItem("dumos_active_store_id", "store-a");

      // Simulates a cancelQueries() that hangs (e.g.
      // Rationale: docs/CLIENT_COMMENTS.md#line-__tests__-store-context-switch-clears-cache-test-tsx-L175
      cancelQueries.mockImplementation(() => new Promise(() => {}));

      const { result } = renderHook(() => useStore(), { wrapper });

      await vi.waitFor(() => expect(result.current.loading).toBe(false));

      act(() => {
        result.current.switchStore("store-b");
      });
      expect(result.current.isSwitchingStore).toBe(true);

      await act(async () => {
        await vi.advanceTimersByTimeAsync(5000);
      });

      expect(result.current.isSwitchingStore).toBe(false);
      expect(clear).toHaveBeenCalled();
    } finally {
      vi.useRealTimers();
    }
  });
});
