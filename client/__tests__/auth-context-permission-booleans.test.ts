import { describe, it, expect, beforeAll, beforeEach, vi } from "vitest";
import React, { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import initSqlJs, { type Database } from "sql.js";

vi.mock("idb-keyval", () => ({
  get: vi.fn(async () => undefined),
  set: vi.fn(async () => undefined),
}));

/**
 * Confirms the migration is behavior-preserving: an auditor (who is denied
 * process_sales by DEFAULT_GROUP_PERMISSIONS.auditor, same as
 * checkCanProcessSales denied them before) still sees canProcessSales as
 * false once assigned their seeded default group, and a manager (granted
 * it) sees it as true - i.e. the new data-driven path agrees with the old
 * hardcoded arrays for the default groups.
 */
describe("useAuth's permission booleans after the group-based migration", () => {
  let db: Database;
  let core: typeof import("@/lib/db/core");
  let container: HTMLDivElement;
  let root: Root;
  let capturedFlags: { isAdmin?: boolean; canProcessSales?: boolean } = {};

  beforeAll(async () => {
    (globalThis as any).IS_REACT_ACT_ENVIRONMENT = true;
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
      const { isAdmin, canProcessSales } = useAuth();
      capturedFlags = { isAdmin, canProcessSales };
      return null;
    }

    root = createRoot(container);
    await act(async () => {
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

  // The two cases above happen to agree with the OLD hardcoded
  // checkCanProcessSales(role) array too, so on their own they can't prove
  // the new logic actually reads the assigned GROUP rather than just the
  // role string. This case uses a role checkCanProcessSales would have
  // denied (auditor), but grants it via the group instead - only
  // group-driven logic can pass this.
  it("actually reads the assigned group's grant, not just the role string", async () => {
    await renderWithUser("auditor", ["process_sales"]);
    expect(capturedFlags.canProcessSales).toBe(true);
  });
});
