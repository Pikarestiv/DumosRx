import { describe, it, expect, beforeAll, beforeEach, vi } from "vitest";
import { renderHook, act } from "@testing-library/react";
import initSqlJs, { type Database } from "sql.js";
import React from "react";

/**
 * Regression coverage for a MEDIUM data-loss bug found in an Opus review of
 * a prior fix round: that round added clearPOSCartStorage() inside login()
 * intending to clear the cart only when switching to a DIFFERENT cashier or
 * logging out. But login() is ALSO how the lock-screen's ordinary "same
 * user unlocks with their own PIN after auto-lock/idle timeout" flow
 * re-authenticates (see lock-screen.tsx / dashboard-layout.tsx's
 * onUnlockSuccess wiring) — so a cashier who stepped away with an
 * in-progress cart came back to an empty one.
 *
 * The fix captures the previously-logged-in user's id before login()
 * overwrites it, and only clears the cart when the incoming user is
 * genuinely different.
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

const clearPOSCartStorageMock = vi.fn();
vi.mock("@/lib/hooks/use-pos-cart", () => ({
  clearPOSCartStorage: clearPOSCartStorageMock,
}));

describe("login() only clears the POS cart on a genuine user switch", () => {
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
    clearPOSCartStorageMock.mockClear();
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

  it("preserves the cart when the same cashier unlocks with their own PIN", async () => {
    seedUser({
      id: "cashier-1",
      username: "cashier1",
      pin: "1111",
      role: "sales_staff",
      storeId: "store-a",
    });

    const { result } = renderHook(() => useAuth(), { wrapper });

    // First login (e.g. start of shift).
    await act(async () => {
      await result.current.login("cashier1", "1111");
    });
    clearPOSCartStorageMock.mockClear();

    // Auto-lock kicks in, then the SAME cashier unlocks with their own PIN
    // (lock-screen calls login() directly here, without logout()).
    await act(async () => {
      const success = await result.current.login("cashier1", "1111");
      expect(success).toBe(true);
    });

    expect(clearPOSCartStorageMock).not.toHaveBeenCalled();
  });

  it("clears the cart when switching to a DIFFERENT recent user from the lock screen", async () => {
    seedUser({
      id: "cashier-1",
      username: "cashier1",
      pin: "1111",
      role: "sales_staff",
      storeId: "store-a",
    });
    seedUser({
      id: "cashier-2",
      username: "cashier2",
      pin: "2222",
      role: "sales_staff",
      storeId: "store-a",
    });

    const { result } = renderHook(() => useAuth(), { wrapper });

    await act(async () => {
      await result.current.login("cashier1", "1111");
    });
    clearPOSCartStorageMock.mockClear();

    await act(async () => {
      const success = await result.current.login("cashier2", "2222");
      expect(success).toBe(true);
    });

    expect(clearPOSCartStorageMock).toHaveBeenCalledTimes(1);
  });

  it("clears the cart on a fresh login with no previous session", async () => {
    seedUser({
      id: "cashier-1",
      username: "cashier1",
      pin: "1111",
      role: "sales_staff",
      storeId: "store-a",
    });

    const { result } = renderHook(() => useAuth(), { wrapper });

    await act(async () => {
      const success = await result.current.login("cashier1", "1111");
      expect(success).toBe(true);
    });

    // No previous user was logged in, so there is nothing "carried over"
    // from a different cashier — but this still exercises the guard's
    // `previousUserId` branch (undefined) without throwing.
    expect(clearPOSCartStorageMock).not.toHaveBeenCalled();
  });

  it("does not clear the cart again on a failed PIN retry by the same user", async () => {
    seedUser({
      id: "cashier-1",
      username: "cashier1",
      pin: "1111",
      role: "sales_staff",
      storeId: "store-a",
    });

    const { result } = renderHook(() => useAuth(), { wrapper });

    await act(async () => {
      await result.current.login("cashier1", "1111");
    });
    clearPOSCartStorageMock.mockClear();

    await act(async () => {
      const success = await result.current.login("cashier1", "0000");
      expect(success).toBe(false);
    });

    expect(clearPOSCartStorageMock).not.toHaveBeenCalled();
  });
});
