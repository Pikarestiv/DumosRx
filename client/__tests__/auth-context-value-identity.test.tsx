import { describe, it, expect, beforeAll, beforeEach, vi } from "vitest";
import { renderHook, act } from "@testing-library/react";
import initSqlJs, { type Database } from "sql.js";
import React from "react";

/**
 * AuthContext has ~70 useAuth() consumers app-wide. A fresh value object per
 * provider render invalidates every one of them, so the provider's value (and
 * the callbacks inside it) must keep a stable identity while nothing it
 * exposes has actually changed.
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

describe("AuthContext provider value identity", () => {
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

  it("keeps the same context object across re-renders that change nothing", async () => {
    const { result, rerender } = renderHook(() => useAuth(), { wrapper });
    await act(async () => {});

    const first = result.current;
    rerender();
    await act(async () => {});

    expect(result.current).toBe(first);
    expect(result.current.login).toBe(first.login);
    expect(result.current.logout).toBe(first.logout);
    expect(result.current.verifyPin).toBe(first.verifyPin);
    expect(result.current.changePin).toBe(first.changePin);
    expect(result.current.loginFromHandoff).toBe(first.loginFromHandoff);
    expect(result.current.linkCloudAccount).toBe(first.linkCloudAccount);
  });

  it("still publishes a new context object once the signed-in user changes", async () => {
    db.run(
      `INSERT INTO users (id, first_name, last_name, username, pin, role, store_id, is_active, _deleted)
       VALUES ('u-1', 'Test', 'User', 'tester', '1111', 'store_owner', 'store-a', 1, 0)`,
    );

    const { result } = renderHook(() => useAuth(), { wrapper });
    await act(async () => {});
    const before = result.current;

    await act(async () => {
      await result.current.login("tester", "1111");
    });

    expect(result.current).not.toBe(before);
    expect(result.current.isAuthenticated).toBe(true);
  });
});
