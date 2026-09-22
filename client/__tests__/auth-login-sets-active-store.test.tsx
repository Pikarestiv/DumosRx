import { describe, it, expect, beforeAll, beforeEach, vi } from "vitest";
import { renderHook, act } from "@testing-library/react";
import initSqlJs, { type Database } from "sql.js";
import React from "react";

/**
 * Regression coverage for a Critical bug (docs/KNOWN_BUGS.md):
 * getUserByUsernameOrEmail() has no store scoping, so on a multi-store
 * device a login isn't tied to the currently-selected store. The chosen fix
 * is not to filter the lookup (that would lock a cashier out of a device
 * whose switcher points at a sibling store) but to follow the authenticated
 * account: a store-pinned user's own store_id becomes the active store the
 * moment they log in.
 *
 * store-context.tsx already gives `user.store_id` precedence in its DERIVED
 * activeStoreId/targetId, but it never persists it. Two consumers read the
 * persisted value directly and so were left on the previous store:
 * lib/api/client.ts's sync push/pull (X-Store-Id) and store-context.tsx's
 * own lazy initializer on the next mount. These tests pin down both the
 * persisted key and the module-scope query resolver in lib/db/core.ts.
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
  mirrorAuthToken: vi.fn(),
}));

vi.mock("idb-keyval", () => ({
  get: vi.fn(async () => undefined),
  set: vi.fn(async () => undefined),
}));

const ACTIVE_STORE_KEY = "dumos_active_store_id";

describe("login() sets the active store for a store-pinned account", () => {
  let db: Database;
  let core: typeof import("@/lib/db/core");
  let useAuth: typeof import("@/lib/context/auth-context").useAuth;
  let AuthProvider: typeof import("@/lib/context/auth-context").AuthProvider;

  beforeAll(async () => {
    core = await import("@/lib/db/core");
    const authContext = await import("@/lib/context/auth-context");
    useAuth = authContext.useAuth;
    AuthProvider = authContext.AuthProvider;

    const { SCHEMA_SQL } = await import("@/lib/db/schema");
    const SQL = await initSqlJs({
      locateFile: () => require.resolve("sql.js/dist/sql-wasm.wasm"),
    });
    db = new SQL.Database();
    db.run(SCHEMA_SQL);
    core.__setDatabaseForTesting(db);
  });

  beforeEach(() => {
    db.run(`DELETE FROM users; DELETE FROM _sync_queue;`);
    localStorage.clear();
    sessionStorage.clear();
    core.setCurrentUser(null);
    core.setActiveStoreId(null);
  });

  function wrapper({ children }: { children: React.ReactNode }) {
    return React.createElement(AuthProvider, null, children);
  }

  function seedUser(opts: {
    id: string;
    username: string;
    pin: string;
    role: string;
    storeId: string | null;
  }) {
    db.run(
      `INSERT INTO users (id, first_name, last_name, username, pin, role, store_id, is_active, _deleted)
       VALUES (?, 'Test', 'User', ?, ?, ?, ?, 1, 0)`,
      [opts.id, opts.username, opts.pin, opts.role, opts.storeId],
    );
  }

  it("persists the pinned user's own store and points the query resolver at it", async () => {
    seedUser({
      id: "cashier-1",
      username: "cashier1",
      pin: "1111",
      role: "sales_staff",
      storeId: "store-a",
    });

    const { result } = renderHook(() => useAuth(), { wrapper });

    let success = false;
    await act(async () => {
      success = await result.current.login("cashier1", "1111");
    });

    expect(success).toBe(true);
    expect(localStorage.getItem(ACTIVE_STORE_KEY)).toBe("store-a");
    expect(core.getActiveStoreId()).toBe("store-a");
  });

  it("overrides a DIFFERENT store left active on this device by a previous owner session", async () => {
    // The device's owner had switched to store-b and logged out; both the
    // persisted key and the module-scope resolver still say store-b.
    localStorage.setItem(ACTIVE_STORE_KEY, "store-b");
    core.setActiveStoreId("store-b");

    seedUser({
      id: "cashier-2",
      username: "cashier2",
      pin: "2222",
      role: "sales_staff",
      storeId: "store-a",
    });

    const { result } = renderHook(() => useAuth(), { wrapper });

    let success = false;
    await act(async () => {
      success = await result.current.login("cashier2", "2222");
    });

    expect(success).toBe(true);
    // No stale store-b left behind for lib/api/client.ts's X-Store-Id (sync
    // push/pull) or for store-context.tsx's next lazy initializer.
    expect(localStorage.getItem(ACTIVE_STORE_KEY)).toBe("store-a");
    expect(core.getActiveStoreId()).toBe("store-a");
  });

  it("is set synchronously by login(), not by a later StoreProvider render", async () => {
    // Nothing but AuthProvider is mounted here - no StoreProvider at all -
    // so if the active store is correct it can only have been login() that
    // set it, closing the window before the provider's targetId effect runs.
    localStorage.setItem(ACTIVE_STORE_KEY, "store-b");
    core.setActiveStoreId("store-b");

    seedUser({
      id: "cashier-3",
      username: "cashier3",
      pin: "3333",
      role: "manager",
      storeId: "store-c",
    });

    const { result } = renderHook(() => useAuth(), { wrapper });

    await act(async () => {
      await result.current.login("cashier3", "3333");
    });

    expect(core.getActiveStoreId()).toBe("store-c");
    expect(localStorage.getItem(ACTIVE_STORE_KEY)).toBe("store-c");
  });

  it("also works when the pinned user logs in by email", async () => {
    db.run(
      `INSERT INTO users (id, first_name, last_name, username, email, pin, role, store_id, is_active, _deleted)
       VALUES ('cashier-4', 'Test', 'User', 'cashier4', 'cashier4@example.com', '4444', 'specialist', 'store-d', 1, 0)`,
    );
    localStorage.setItem(ACTIVE_STORE_KEY, "store-b");

    const { result } = renderHook(() => useAuth(), { wrapper });

    let success = false;
    await act(async () => {
      success = await result.current.login("cashier4@example.com", "4444");
    });

    expect(success).toBe(true);
    expect(localStorage.getItem(ACTIVE_STORE_KEY)).toBe("store-d");
    expect(core.getActiveStoreId()).toBe("store-d");
  });

  it("leaves an owner/admin's switcher choice alone (no fixed store_id)", async () => {
    // An owner has access to every store on the device; their active store
    // is whatever they last switched to, which store-context.tsx persists
    // on their behalf. login() must not clobber or clear it.
    localStorage.setItem(ACTIVE_STORE_KEY, "store-b");
    core.setActiveStoreId("store-b");

    seedUser({
      id: "owner-1",
      username: "owner1",
      pin: "9999",
      role: "store_owner",
      storeId: null,
    });

    const { result } = renderHook(() => useAuth(), { wrapper });

    let success = false;
    await act(async () => {
      success = await result.current.login("owner1", "9999");
    });

    expect(success).toBe(true);
    expect(localStorage.getItem(ACTIVE_STORE_KEY)).toBe("store-b");
    expect(core.getActiveStoreId()).toBe("store-b");
  });

  it("a failed PIN attempt does not move the active store", async () => {
    localStorage.setItem(ACTIVE_STORE_KEY, "store-b");
    core.setActiveStoreId("store-b");

    seedUser({
      id: "cashier-5",
      username: "cashier5",
      pin: "5555",
      role: "sales_staff",
      storeId: "store-a",
    });

    const { result } = renderHook(() => useAuth(), { wrapper });

    let success = true;
    await act(async () => {
      success = await result.current.login("cashier5", "0000");
    });

    expect(success).toBe(false);
    expect(localStorage.getItem(ACTIVE_STORE_KEY)).toBe("store-b");
    expect(core.getActiveStoreId()).toBe("store-b");
  });
});
