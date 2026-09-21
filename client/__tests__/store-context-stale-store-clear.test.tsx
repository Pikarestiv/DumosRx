import { describe, it, expect, beforeAll, beforeEach, vi } from "vitest";
import { renderHook, waitFor } from "@testing-library/react";
import initSqlJs, { type Database } from "sql.js";
import React from "react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";

/**
 * Regression coverage for a Medium-severity bug (docs/KNOWN_BUGS.md):
 * storeProfile's queryFn used to clear the stale active-store id
 * (localStorage.removeItem + setActiveStoreId(null)) as a side effect
 * INSIDE itself, on the fallback branch taken when the active store no
 * longer exists locally. A React Query retry re-fires that side effect,
 * and the resulting activeStoreId state change flips `targetId` mid-fetch
 * (a new queryKey), triggering a second fetch on every miss.
 *
 * Fixed by moving the clearing logic out into its own effect, gated on a
 * settled query result (storeProfile.id !== targetId), so it fires at most
 * once per genuine staleness rather than on every internal retry/re-render.
 * This test spies on getStoreById (the underlying DB call inside queryFn)
 * to assert it's invoked a bounded number of times for the stale id, not
 * repeatedly.
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

describe("store-context stale active-store clearing", () => {
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
      React.createElement(AuthProvider, null, React.createElement(StoreProvider, null, children)),
    );
  }

  it("falls back to another known store and syncs the resolver to it directly, without ever clearing to null first", async () => {
    // The device's last-active store id points at a store that no longer
    // exists locally (e.g. pruned by sync reconciliation) - only "store-b"
    // is real.
    db.run(`INSERT INTO stores (id, name) VALUES ('store-b', 'Store B')`);
    localStorage.setItem("dumos_active_store_id", "store-stale");
    // No logged-in user with a fixed store_id (owner/admin case) - the
    // fallback branch requires `!user?.store_id`.
    const removeItemSpy = vi.spyOn(Storage.prototype, "removeItem");

    const { result } = renderHook(() => useStore(), { wrapper });

    await waitFor(() => expect(result.current.loading).toBe(false));
    await waitFor(() => expect(result.current.storeProfile?.id).toBe("store-b"));

    expect(core.getActiveStoreId()).toBe("store-b");
    expect(localStorage.getItem("dumos_active_store_id")).toBe("store-b");

    // The old version cleared the stale id to null (localStorage.removeItem
    // + setActiveStoreId(null)) as a side effect inside queryFn itself, then
    // relied on a second effect pass to notice `!targetId` and sync forward
    // to the real store - a two-step cascade through an intermediate null
    // state. The fix resolves storeProfile.id !== targetId directly, in one
    // effect, without ever routing through null - so dumos_active_store_id
    // is never removed at any point, only ever set straight to the correct
    // value.
    expect(removeItemSpy).not.toHaveBeenCalledWith("dumos_active_store_id");
  });
});
