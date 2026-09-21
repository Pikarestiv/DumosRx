import { describe, it, expect, beforeAll, beforeEach, vi } from "vitest";
import { renderHook, act, waitFor } from "@testing-library/react";
import initSqlJs, { type Database } from "sql.js";
import React from "react";

/**
 * Regression coverage for the "no users exist" login fallback (SECURITY,
 * docs/KNOWN_BUGS.md): it used to fire for ANY typed PIN whenever the typed
 * identifier was "admin" and simply didn't match a local row - not "zero
 * users exist locally". A device mid-sync (hasn't pulled its real "admin"
 * user down yet) or one whose real admin account was later
 * renamed/deleted could hit it with real users already present, granting a
 * full admin session for an arbitrary PIN. Exercises the real login()
 * against a real in-memory sql.js instance (not a reimplementation).
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

describe("login() default-admin bootstrap gating", () => {
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
    db.run(`DELETE FROM users; DELETE FROM _sync_queue; DELETE FROM audit_logs;`);
    localStorage.clear();
    sessionStorage.clear();
    core.setCurrentUser(null);
  });

  function wrapper({ children }: { children: React.ReactNode }) {
    return React.createElement(AuthProvider, null, children);
  }

  it("bootstraps the default admin with the correct PIN when zero local users exist", async () => {
    const { result } = renderHook(() => useAuth(), { wrapper });

    let success = false;
    await act(async () => {
      success = await result.current.login("admin", "1234");
    });

    expect(success).toBe(true);
    await waitFor(() => expect(result.current.user?.id).toBe("default-admin"));

    const row = db.exec("SELECT id, role FROM users WHERE id = 'default-admin'");
    expect(row[0]?.values[0]?.[0]).toBe("default-admin");
    expect(row[0]?.values[0]?.[1]).toBe("admin");

    // Must have gone through insert() (sync queue populated), not a raw
    // sync-bypassing query.
    const queued = db.exec(
      "SELECT COUNT(*) FROM _sync_queue WHERE table_name = 'users' AND record_id = 'default-admin'",
    );
    expect(queued[0]?.values[0]?.[0]).toBe(1);
  });

  it("rejects the default-admin bootstrap with any PIN other than the documented default", async () => {
    const { result } = renderHook(() => useAuth(), { wrapper });

    let success = true;
    await act(async () => {
      success = await result.current.login("admin", "0000");
    });

    expect(success).toBe(false);
    expect(result.current.user).toBeNull();

    const row = db.exec("SELECT id FROM users WHERE id = 'default-admin'");
    expect(row.length).toBe(0);
  });

  it("refuses to bootstrap the default admin when a real user already exists, even with the correct default PIN", async () => {
    db.run(
      `INSERT INTO users (id, first_name, last_name, username, pin, role, is_active, _deleted) VALUES ('real-user-1', 'Real', 'Owner', 'realowner', '9999', 'store_owner', 1, 0)`,
    );

    const { result } = renderHook(() => useAuth(), { wrapper });

    let success = true;
    await act(async () => {
      success = await result.current.login("admin", "1234");
    });

    expect(success).toBe(false);
    expect(result.current.user).toBeNull();

    // No default-admin row was created - the real user's presence blocked it.
    const row = db.exec("SELECT id FROM users WHERE id = 'default-admin'");
    expect(row.length).toBe(0);
  });

  it("still logs in a real matching user normally (unaffected by the gating change)", async () => {
    db.run(
      `INSERT INTO users (id, first_name, last_name, username, pin, role, is_active, _deleted) VALUES ('real-user-1', 'Real', 'Owner', 'realowner', '9999', 'store_owner', 1, 0)`,
    );

    const { result } = renderHook(() => useAuth(), { wrapper });

    let success = false;
    await act(async () => {
      success = await result.current.login("realowner", "9999");
    });

    expect(success).toBe(true);
    await waitFor(() => expect(result.current.user?.id).toBe("real-user-1"));
  });

  it("a soft-deleted user can no longer log in (getUserByUsernameOrEmail now filters _deleted)", async () => {
    db.run(
      `INSERT INTO users (id, first_name, last_name, username, pin, role, is_active, _deleted) VALUES ('deleted-user', 'Gone', 'User', 'goneuser', '5555', 'sales_staff', 1, 1)`,
    );

    const { result } = renderHook(() => useAuth(), { wrapper });

    let success = true;
    await act(async () => {
      success = await result.current.login("goneuser", "5555");
    });

    expect(success).toBe(false);
    expect(result.current.user).toBeNull();
  });

  it("locks out a user after repeated wrong PINs, then unlocks after the login() call itself resets", async () => {
    db.run(
      `INSERT INTO users (id, first_name, last_name, username, pin, role, is_active, _deleted) VALUES ('real-user-2', 'Real', 'Cashier', 'cashier1', '1111', 'sales_staff', 1, 0)`,
    );

    const { result } = renderHook(() => useAuth(), { wrapper });

    // 5 wrong PINs in a row.
    for (let i = 0; i < 5; i++) {
      let success = true;
      await act(async () => {
        success = await result.current.login("cashier1", "0000");
      });
      expect(success).toBe(false);
    }

    // The 6th attempt - even with the CORRECT pin - is blocked by the
    // lockout, not by the PIN check.
    await act(async () => {
      await expect(result.current.login("cashier1", "1111")).rejects.toThrow(
        /Too many failed attempts/,
      );
    });
    expect(result.current.user).toBeNull();
  });

  it("does not lock out a different user sharing the same device", async () => {
    db.run(
      `INSERT INTO users (id, first_name, last_name, username, pin, role, is_active, _deleted) VALUES ('real-user-3', 'Real', 'Cashier', 'cashier2', '2222', 'sales_staff', 1, 0)`,
    );
    db.run(
      `INSERT INTO users (id, first_name, last_name, username, pin, role, is_active, _deleted) VALUES ('real-user-4', 'Real', 'Owner', 'owner2', '3333', 'store_owner', 1, 0)`,
    );

    const { result } = renderHook(() => useAuth(), { wrapper });

    for (let i = 0; i < 5; i++) {
      await act(async () => {
        await result.current.login("cashier2", "0000");
      });
    }

    // A different user on the same device is unaffected.
    let success = false;
    await act(async () => {
      success = await result.current.login("owner2", "3333");
    });
    expect(success).toBe(true);
  });
});
