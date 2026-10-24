import { describe, it, expect, beforeAll, beforeEach, vi } from "vitest";
import React, { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import initSqlJs, { type Database } from "sql.js";

vi.mock("idb-keyval", () => ({
  get: vi.fn(() => Promise.resolve(undefined)),
  set: vi.fn(() => Promise.resolve(undefined)),
}));
vi.mock("@sentry/nextjs", () => ({ setUser: vi.fn(), setTag: vi.fn() }));
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
vi.mock("@/lib/db", () => ({ isTauri: vi.fn(() => false) }));
vi.mock("@/lib/api/token-manager", () => ({ getToken: vi.fn(() => null) }));
vi.mock("@/lib/native/widget-bridge", () => ({ mirrorAuthToken: vi.fn() }));

// Regression coverage for a real rules-of-hooks crash (final review, Critical C2):
// Rationale: docs/CLIENT_COMMENTS.md#block-__tests__-pos-layout-header-rules-of-hooks-test-tsx-L25
describe("useHasPermission short-circuit composition (pos-layout-header.tsx pattern)", () => {
  let db: Database;
  let core: typeof import("@/lib/db/core");
  let container: HTMLDivElement;
  let root: Root;
  let thrown: unknown = null;

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
    thrown = null;
  });

  async function renderWithAuditorGrantedProcessSales(useShortCircuitedPattern: boolean) {
    const { AuthProvider, useAuth } = await import("@/lib/context/auth-context");
    const { useHasPermission } = await import("@/lib/hooks/use-permissions");

    const userId = "u1";
    // Role fallback for "auditor" denies process_sales (DEFAULT_GROUP_PERMISSIONS.auditor has no process_sales) - but this use…
    // Rationale: docs/CLIENT_COMMENTS.md#line-__tests__-pos-layout-header-rules-of-hooks-test-tsx-L81
    db.run(`INSERT INTO users (id, role, first_name, last_name) VALUES (?, 'auditor', 'Test', 'User')`, [userId]);
    db.run(
      `INSERT INTO permission_groups (id, store_id, name, based_on_role, is_default, permissions) VALUES ('pg1', 'store1', 'Custom', 'auditor', 0, '["process_sales","manage_staff"]')`,
    );
    db.run(`UPDATE users SET permission_group_id = 'pg1' WHERE id = ?`, [userId]);
    localStorage.setItem("dumos_user", JSON.stringify({ id: userId, role: "auditor", first_name: "Test", last_name: "User", username: "test" }));
    sessionStorage.setItem("dumos_session_authenticated", "1");

    const hasPermissionUnderNonHookName = useHasPermission;

    function BuggyShortCircuited() {
      // Mirrors the exact pre-fix expression shape; the alias lets the linter
      // accept the conditional hook call this test exists to reproduce.
      const result =
        hasPermissionUnderNonHookName("process_sales") &&
        (hasPermissionUnderNonHookName("manage_staff") || false);
      return React.createElement("div", null, String(result));
    }

    function FixedUnconditional() {
      // Mirrors the applied fix: both calls hoisted, unconditional every render.
      const canProcess = useHasPermission("process_sales");
      const isAdminTier = useHasPermission("manage_staff");
      const result = canProcess && isAdminTier;
      return React.createElement("div", null, String(result));
    }

    function Probe() {
      useAuth(); // ensures AuthProvider's own effects run
      return React.createElement(useShortCircuitedPattern ? BuggyShortCircuited : FixedUnconditional);
    }

    root = createRoot(container);
    try {
      await act(() => {
        root.render(React.createElement(AuthProvider, null, React.createElement(Probe)));
        return Promise.resolve();
      });
      // Let the async getUserPermissionGroup() resolution land and trigger
      // the re-render where the hook count would change under the buggy pattern.
      await act(async () => {
        await new Promise((r) => setTimeout(r, 0));
        await new Promise((r) => setTimeout(r, 0));
      });
    } catch (e) {
      thrown = e;
    }
  }

  it("the short-circuited pattern throws a rules-of-hooks error once the group resolves", async () => {
    const originalOnError = console.error;
    console.error = () => {}; // React logs the invariant loudly; keep test output clean
    await renderWithAuditorGrantedProcessSales(true);
    console.error = originalOnError;

    expect(thrown).not.toBeNull();
    expect(String((thrown as Error)?.message || thrown)).toMatch(/hooks/i);

    act(() => root?.unmount());
    container.remove();
  });

  it("the fixed (unconditional) pattern renders cleanly across the same async transition", async () => {
    await renderWithAuditorGrantedProcessSales(false);

    expect(thrown).toBeNull();
    expect(container.textContent).toBe("true"); // process_sales AND manage_staff both granted by the custom group

    act(() => root?.unmount());
    container.remove();
  });
});
