import { describe, it, expect, beforeAll, beforeEach, afterEach, vi } from "vitest";
import React, { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import initSqlJs, { type Database } from "sql.js";

// Same mock set as auth-impersonation-storage-leak.test.tsx:
// Rationale: docs/CLIENT_COMMENTS.md#line-__tests__-auth-context-permission-booleans-test-ts-L6
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
  queryClient: { cancelQueries: vi.fn(async () => {}), clear: vi.fn(), invalidateQueries: vi.fn(async () => {}) },
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
  get: vi.fn(() => Promise.resolve(undefined)),
  set: vi.fn(() => Promise.resolve(undefined)),
}));

// Confirms the migration is behavior-preserving:
// Rationale: docs/CLIENT_COMMENTS.md#block-__tests__-auth-context-permission-booleans-test-ts-L42
describe("useAuth's permission booleans after the group-based migration", () => {
  let db: Database;
  let core: typeof import("@/lib/db/core");
  let container: HTMLDivElement;
  let root: Root;
  let capturedFlags: {
    isAdmin?: boolean;
    canProcessSales?: boolean;
    canManageStockBatch?: boolean;
    canViewAllActivity?: boolean;
  } = {};

  beforeAll(async () => {
    (globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
    core = await import("@/lib/db/core");
    const { SCHEMA_SQL } = await import("@/lib/db/schema");
    const SQL = await initSqlJs({ locateFile: () => require.resolve("sql.js/dist/sql-wasm.wasm") });
    db = new SQL.Database();
    db.run(SCHEMA_SQL);
    core.__setDatabaseForTesting(db);
  });

  beforeEach(() => {
    db.run(`DELETE FROM permission_groups; DELETE FROM stores; DELETE FROM users; DELETE FROM _sync_queue; DELETE FROM audit_logs;`);
    db.run(`INSERT INTO stores (id) VALUES ('store1')`);
    core.setActiveStoreId("store1");
    container = document.createElement("div");
    document.body.appendChild(container);
    capturedFlags = {};
  });

  // Without this, each test's AuthProvider (and its live useEffects, e.g.
  // Rationale: docs/CLIENT_COMMENTS.md#line-__tests__-auth-context-permission-booleans-test-ts-L81
  afterEach(() => {
    act(() => root?.unmount());
    container.remove();
    localStorage.clear();
    sessionStorage.clear();
  });

  async function renderWithUser(role: string, groupPermissions: string[] | null) {
    const { AuthProvider, useAuth } = await import("@/lib/context/auth-context");
    const userId = "u1";
    db.run(`INSERT INTO users (id, role, first_name, last_name) VALUES (?, ?, 'Test', 'User')`, [userId, role]);
    if (groupPermissions) {
      db.run(
        `INSERT INTO permission_groups (id, store_id, name, based_on_role, is_default, permissions) VALUES ('pg1', 'store1', 'Test Group', ?, 1, ?)`,
        [role, JSON.stringify(groupPermissions)],
      );
      db.run(`UPDATE users SET permission_group_id = 'pg1' WHERE id = ?`, [userId]);
    }
    localStorage.setItem("dumos_user", JSON.stringify({ id: userId, role, first_name: "Test", last_name: "User", username: "test" }));
    sessionStorage.setItem("dumos_session_authenticated", "1");

    function Probe() {
      const { isAdmin, canProcessSales, canManageStockBatch, canViewAllActivity } = useAuth();
      capturedFlags = { isAdmin, canProcessSales, canManageStockBatch, canViewAllActivity };
      return null;
    }

    root = createRoot(container);
    await act(() => {
      root.render(React.createElement(AuthProvider, null, React.createElement(Probe)));
    });
    await act(async () => {
      await new Promise((r) => setTimeout(r, 0));
    });
  }

  it("an auditor with the seeded default group cannot process sales", async () => {
    await renderWithUser("auditor", ["view_reports", "export_reports", "view_all_expenses"]);
    expect(capturedFlags.canProcessSales).toBe(false);
  });

  it("a manager with the seeded default group can process sales but is not isAdmin-tier", async () => {
    await renderWithUser("manager", ["process_sales", "manage_staff"]);
    expect(capturedFlags.canProcessSales).toBe(true);
  });

  // The two cases above happen to agree with the OLD hardcoded checkCanProcessSales(role) array too, so on their own they ca…
  // Rationale: docs/CLIENT_COMMENTS.md#line-__tests__-auth-context-permission-booleans-test-ts-L135
  // Pins a DELIBERATE, spec-sanctioned behavior change:
  // Rationale: docs/CLIENT_COMMENTS.md#block-__tests__-auth-context-permission-booleans-test-ts-L141
  it("grants a super_admin every admin-tier boolean via the bypass rule, unlike the old helpers", async () => {
    // An EMPTY group, not no group at all:
    // Rationale: docs/CLIENT_COMMENTS.md#line-__tests__-auth-context-permission-booleans-test-ts-L153
    await renderWithUser("super_admin", []);
    expect(capturedFlags.isAdmin).toBe(true);
    expect(capturedFlags.canManageStockBatch).toBe(true);
    expect(capturedFlags.canViewAllActivity).toBe(true);
  });

  it("actually reads the assigned group's grant, not just the role string", async () => {
    await renderWithUser("auditor", ["process_sales"]);
    expect(capturedFlags.canProcessSales).toBe(true);
  });
});
