import { describe, it, expect, beforeAll, beforeEach, vi } from "vitest";
import { renderHook, waitFor, act } from "@testing-library/react";
import initSqlJs, { type Database } from "sql.js";
import React from "react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";

/**
 * Regression coverage (Low-severity, docs/KNOWN_BUGS.md): setTheme() fired
 * updateStoreProfile() fire-and-forget with no error handling at all — a
 * failed persist left the UI's optimistically-applied theme silently
 * diverged from what's actually stored/synced, with zero signal to the
 * user. Fixed by catching the rejection and surfacing a toast.
 */

const toastError = vi.fn();
vi.mock("sonner", () => ({
  toast: { error: (...args: unknown[]) => toastError(...args) },
}));

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

vi.mock("@/lib/db/local-database", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/db/local-database")>();
  return {
    ...actual,
    update: vi.fn(async () => {
      throw new Error("disk full");
    }),
  };
});

describe("store-context setTheme surfaces a toast on a failed persist", () => {
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
    toastError.mockClear();
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

  it("shows an error toast instead of failing silently when the theme write rejects", async () => {
    db.run(`INSERT INTO stores (id, name) VALUES ('store-a', 'Store A')`);
    localStorage.setItem("dumos_active_store_id", "store-a");

    const { result } = renderHook(() => useStore(), { wrapper });

    await waitFor(() => expect(result.current.loading).toBe(false));
    await waitFor(() => expect(result.current.storeProfile?.id).toBe("store-a"));

    await act(async () => {
      result.current.setTheme("dark");
      // setTheme is deliberately fire-and-forget (doesn't return the
      // promise) — give the rejection a tick to be caught and toasted.
      await new Promise((resolve) => setTimeout(resolve, 0));
    });

    expect(toastError).toHaveBeenCalledTimes(1);
    expect(toastError.mock.calls[0][0]).toContain("theme");
  });
});
