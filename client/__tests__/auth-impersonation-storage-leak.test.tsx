import { describe, it, expect, beforeAll, beforeEach, vi } from "vitest";
import { renderHook, act, waitFor } from "@testing-library/react";
import initSqlJs, { type Database } from "sql.js";
import React from "react";

/**
 * Regression coverage for a High-severity bug (docs/KNOWN_BUGS.md):
 * loginFromHandoff() deliberately avoids calling setDbUser() for an
 * impersonated profile (moving the local DB's "current user" pointer to a
 * foreign-store user would corrupt audit-log/performed_by attribution), but
 * it persisted the profile under the SAME "dumos_user" localStorage key the
 * normal mount effect reads - so the very next reload restored it through
 * the ordinary path anyway, calling setDbUser() and defeating the intended
 * separation.
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

describe("impersonation session storage separation", () => {
  let db: Database;
  let core: typeof import("@/lib/db/core");
  let useAuth: typeof import("@/lib/context/auth-context").useAuth;
  let AuthProvider: typeof import("@/lib/context/auth-context").AuthProvider;
  let setCurrentUserSpy: ReturnType<typeof vi.spyOn>;

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
    setCurrentUserSpy = vi.spyOn(core, "setCurrentUser");
  });

  function wrapper({ children }: { children: React.ReactNode }) {
    return React.createElement(AuthProvider, null, children);
  }

  it("does not persist the impersonated profile under the normal dumos_user key", async () => {
    const { result } = renderHook(() => useAuth(), { wrapper });

    act(() => {
      result.current.loginFromHandoff({
        id: "foreign-user-1",
        first_name: "Foreign",
        last_name: "Staff",
        username: "foreignstaff",
        role: "sales_staff",
        store_id: "foreign-store",
      });
    });

    await waitFor(() => expect(result.current.user?.id).toBe("foreign-user-1"));

    expect(localStorage.getItem("dumos_user")).toBeNull();
    expect(localStorage.getItem("dumos_impersonated_user")).toContain("foreign-user-1");

    // setDbUser (core.setCurrentUser) must never have been called with the
    // impersonated profile - moving the local DB's "current user" pointer
    // to a foreign-store user is exactly what this separation prevents.
    const calledWithForeignUser = setCurrentUserSpy.mock.calls.some(
      (call: unknown[]) => (call[0] as { id?: string } | null)?.id === "foreign-user-1",
    );
    expect(calledWithForeignUser).toBe(false);
  });

  it("restores the impersonated session across a reload WITHOUT ever routing it through setDbUser()", async () => {
    const first = renderHook(() => useAuth(), { wrapper });
    act(() => {
      first.result.current.loginFromHandoff({
        id: "foreign-user-2",
        first_name: "Foreign",
        last_name: "Staff",
        username: "foreignstaff2",
        role: "sales_staff",
        store_id: "foreign-store",
      });
    });
    await waitFor(() => expect(first.result.current.user?.id).toBe("foreign-user-2"));
    first.unmount();

    // Simulate a reload: a brand new AuthProvider mount, reading whatever
    // localStorage now holds.
    setCurrentUserSpy.mockClear();
    const second = renderHook(() => useAuth(), { wrapper });

    await waitFor(() => expect(second.result.current.user?.id).toBe("foreign-user-2"));

    const calledWithForeignUser = setCurrentUserSpy.mock.calls.some(
      (call: unknown[]) => (call[0] as { id?: string } | null)?.id === "foreign-user-2",
    );
    expect(calledWithForeignUser).toBe(false);
  });

  it("a normal PIN login clears any leftover impersonated session, so it can't win on the next reload", async () => {
    db.run(
      `INSERT INTO users (id, first_name, last_name, username, pin, role, is_active, _deleted) VALUES ('real-user-5', 'Real', 'Owner', 'realowner5', '4444', 'store_owner', 1, 0)`,
    );

    // A leftover impersonated session from an improperly-ended handoff.
    localStorage.setItem(
      "dumos_impersonated_user",
      JSON.stringify({ id: "foreign-user-3", username: "foreignstaff3" }),
    );

    const { result } = renderHook(() => useAuth(), { wrapper });

    let success = false;
    await act(async () => {
      success = await result.current.login("realowner5", "4444");
    });

    expect(success).toBe(true);
    expect(localStorage.getItem("dumos_impersonated_user")).toBeNull();
    // Also re-enables sync for this real session: sync() refuses to run
    // while either impersonation flag is set.
    expect(localStorage.getItem("impersonator_handoff_return_code")).toBeNull();
    expect(result.current.isImpersonating).toBe(false);
  });

  it("exposes isImpersonating on the auth context, so consumers don't each read localStorage", async () => {
    const { result } = renderHook(() => useAuth(), { wrapper });

    await waitFor(() => expect(result.current.isHydrated).toBe(true));
    expect(result.current.isImpersonating).toBe(false);

    act(() => {
      result.current.loginFromHandoff({
        id: "foreign-user-4",
        first_name: "Foreign",
        last_name: "Staff",
        username: "foreignstaff4",
        role: "sales_staff",
        store_id: "foreign-store",
      });
    });

    await waitFor(() => expect(result.current.isImpersonating).toBe(true));

    act(() => {
      result.current.logout();
    });

    await waitFor(() => expect(result.current.isImpersonating).toBe(false));
    expect(localStorage.getItem("dumos_impersonated_user")).toBeNull();
  });
});
