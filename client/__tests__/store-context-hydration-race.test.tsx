import { describe, it, expect, beforeAll, beforeEach, vi } from "vitest";
import { renderHook, waitFor } from "@testing-library/react";
import initSqlJs, { type Database } from "sql.js";
import React from "react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";

// Regression coverage for a High-severity bug (docs/KNOWN_BUGS.md):
// Rationale: docs/CLIENT_COMMENTS.md#block-__tests__-store-context-hydration-race-test-tsx-L7

vi.mock("@sentry/nextjs", () => ({
  setUser: vi.fn(),
  setTag: vi.fn(),
}));

vi.mock("@/lib/api/client", () => ({
  apiClient: { login: vi.fn(), setToken: vi.fn() },
}));

vi.mock("@/lib/db/sync-engine", () => ({
  sync: vi.fn(() => Promise.resolve({ success: true })),
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
  get: vi.fn(() => Promise.resolve(undefined)),
  set: vi.fn(() => Promise.resolve(undefined)),
}));

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn(), replace: vi.fn(), prefetch: vi.fn() }),
  useSearchParams: () => new URLSearchParams(),
  usePathname: () => "/",
}));

describe("store-context hydration race", () => {
  let db: Database;
  let core: typeof import("@/lib/db/core");
  let useStore: typeof import("@/lib/context/store-context").useStore;
  let StoreProvider: typeof import("@/lib/context/store-context").StoreProvider;
  let AuthProvider: typeof import("@/lib/context/auth-context").AuthProvider;
  let setActiveStoreIdSpy: ReturnType<typeof vi.spyOn>;

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
    setActiveStoreIdSpy = vi.spyOn(core, "setActiveStoreId");
  });

  function wrapper({ children }: { children: React.ReactNode }) {
    // Fresh QueryClient per render (i.e.
    // Rationale: docs/CLIENT_COMMENTS.md#line-__tests__-store-context-hydration-race-test-tsx-L102
    const queryClient = new QueryClient({
      defaultOptions: { queries: { retry: false } },
    });
    return React.createElement(
      QueryClientProvider,
      { client: queryClient },
      React.createElement(AuthProvider, null, React.createElement(StoreProvider, null, children)),
    );
  }

  it("never mirrors the wrong (localStorage) store id into the resolver for a staff member pinned to a different store", async () => {
    db.run(`INSERT INTO stores (id, name) VALUES ('store-a', 'Store A'), ('store-b', 'Store B')`);
    db.run(
      `INSERT INTO users (id, first_name, last_name, username, pin, role, store_id, is_active, _deleted) VALUES ('staff-1', 'Staff', 'Member', 'staffmember', '1111', 'sales_staff', 'store-b', 1, 0)`,
    );

    // The device's last-active store (e.g.
    // Rationale: docs/CLIENT_COMMENTS.md#line-__tests__-store-context-hydration-race-test-tsx-L124
    localStorage.setItem("dumos_active_store_id", "store-a");
    localStorage.setItem(
      "dumos_user",
      JSON.stringify({
        id: "staff-1",
        first_name: "Staff",
        last_name: "Member",
        username: "staffmember",
        role: "sales_staff",
        store_id: "store-b",
      }),
    );

    const { result } = renderHook(() => useStore(), { wrapper });

    await waitFor(() => expect(result.current.loading).toBe(false));

    // The resolver must have ended up on the user's real store...
    expect(core.getActiveStoreId()).toBe("store-b");
    // ...and must NEVER have been set to store A at any point along the way.
    const calledWithStoreA = setActiveStoreIdSpy.mock.calls.some((call: unknown[]) => call[0] === "store-a");
    expect(calledWithStoreA).toBe(false);
  });

  it("reports loading:true throughout the pre-hydration window, not a premature false", async () => {
    db.run(`INSERT INTO stores (id, name) VALUES ('store-a', 'Store A')`);
    localStorage.setItem("dumos_active_store_id", "store-a");

    const { result } = renderHook(() => useStore(), { wrapper });

    // Whatever the very first synchronous render observes, it must not be "confirmed not loading with no store" - that's the s…
    // Rationale: docs/CLIENT_COMMENTS.md#line-__tests__-store-context-hydration-race-test-tsx-L157
    if (!result.current.loading) {
      expect(result.current.storeProfile).not.toBeNull();
    }

    await waitFor(() => expect(result.current.loading).toBe(false));
  });
});
