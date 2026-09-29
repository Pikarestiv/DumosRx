import { describe, it, expect, beforeAll, beforeEach, vi } from "vitest";
import { renderHook, waitFor } from "@testing-library/react";
import initSqlJs, { type Database } from "sql.js";
import React from "react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";

/**
 * StoreContext has ~77 useStore() consumers, and `t` is handed down as a prop
 * into list rows in several places. A fresh value object, a fresh `t` and a
 * fresh `availableStores` array per render invalidate all of them, so all
 * three must keep a stable identity while nothing behind them has changed.
 */

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

vi.mock("@/lib/query-client", () => ({
  queryClient: { cancelQueries: vi.fn(async () => {}), clear: vi.fn() },
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

describe("StoreContext provider value identity", () => {
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
  });

  function wrapper({ children }: { children: React.ReactNode }) {
    const queryClient = new QueryClient({
      defaultOptions: { queries: { retry: false } },
    });
    return React.createElement(
      QueryClientProvider,
      { client: queryClient },
      React.createElement(
        AuthProvider,
        null,
        React.createElement(StoreProvider, null, children),
      ),
    );
  }

  it("keeps the same context object, t and availableStores across re-renders that change nothing", async () => {
    db.run(`INSERT INTO stores (id, name) VALUES ('store-a', 'Store A')`);
    localStorage.setItem("dumos_active_store_id", "store-a");

    const { result, rerender } = renderHook(() => useStore(), { wrapper });
    await waitFor(() => expect(result.current.loading).toBe(false));

    const first = result.current;
    rerender();

    expect(result.current).toBe(first);
    expect(result.current.t).toBe(first.t);
    expect(result.current.availableStores).toBe(first.availableStores);
    expect(result.current.switchStore).toBe(first.switchStore);
  });

  it("hands out the same empty array while the store list is still unresolved", async () => {
    const { result, rerender } = renderHook(() => useStore(), { wrapper });

    const firstStores = result.current.availableStores;
    expect(firstStores).toEqual([]);
    rerender();

    expect(result.current.availableStores).toBe(firstStores);
  });

  it("still translates through the active store's terminology", async () => {
    db.run(
      `INSERT INTO stores (id, name, store_type) VALUES ('store-a', 'Store A', 'pharmacy')`,
    );
    localStorage.setItem("dumos_active_store_id", "store-a");

    const { result } = renderHook(() => useStore(), { wrapper });
    await waitFor(() => expect(result.current.loading).toBe(false));

    expect(result.current.storeType).toBe("pharmacy");
    expect(typeof result.current.t("product")).toBe("string");
  });
});
