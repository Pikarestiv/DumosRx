import { describe, it, expect, beforeAll, beforeEach, vi } from "vitest";
import React, { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import initSqlJs, { type Database } from "sql.js";

vi.mock("idb-keyval", () => ({
  get: vi.fn(async () => undefined),
  set: vi.fn(async () => undefined),
}));
vi.mock("@sentry/nextjs", () => ({ setUser: vi.fn(), setTag: vi.fn() }));
vi.mock("@/lib/api/client", () => ({
  apiClient: { login: vi.fn(), setToken: vi.fn() },
}));
vi.mock("@/lib/db/sync-engine", () => ({
  sync: vi.fn(async () => ({ success: true })),
  isSyncing: vi.fn(() => false),
}));
vi.mock("@/lib/query-client", () => ({
  queryClient: { cancelQueries: vi.fn(async () => {}), clear: vi.fn(), invalidateQueries: vi.fn(async () => {}) },
}));
vi.mock("@/lib/db", () => ({ isTauri: vi.fn(() => false) }));
vi.mock("@/lib/api/token-manager", () => ({ getToken: vi.fn(() => null) }));
vi.mock("@/lib/native/widget-bridge", () => ({ mirrorAuthToken: vi.fn() }));

/**
 * Regression coverage for a real rules-of-hooks crash (final review,
 * Critical C2): pos-layout-header.tsx computed canRequestTransfer as
 *
 *   useHasPermission("process_sales") &&
 *   (useHasPermission("manage_staff") || toggle === 1) && ...
 *
 * `&&` short-circuits, so the second useHasPermission() call only
 * happens on renders where the first one returns true. useHasPermission
 * resolves its group ASYNCHRONOUSLY (starts from the role's fallback
 * permissions, then updates once the real group loads) - for a role whose
 * FALLBACK denies "process_sales" but whose assigned GROUP grants it (a
 * custom group more permissive than the role tier, exactly the feature's
 * own reason to exist), the first render skips the second hook call
 * entirely and a later render - once the group resolves - calls it. That
 * is a hook COUNT that differs between renders of the same component
 * instance, which React's dev-mode invariant throws on
 * ("Rendered more hooks than during the previous render").
 *
 * This test reproduces the exact pattern with the REAL hasPermission/
 * useHasPermission implementation and a REAL async group-load race
 * (not mocked), against a component matching pos-layout-header.tsx's
 * conditional-vs-fixed shape, to prove the crash is real and that
 * hoisting both calls to unconditional consts (the applied fix) closes it.
 */
describe("useHasPermission short-circuit composition (pos-layout-header.tsx pattern)", () => {
  let db: Database;
  let core: typeof import("@/lib/db/core");
  let container: HTMLDivElement;
  let root: Root;
  let thrown: unknown = null;

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
    thrown = null;
  });

  async function renderWithAuditorGrantedProcessSales(useShortCircuitedPattern: boolean) {
    const { AuthProvider, useAuth } = await import("@/lib/context/auth-context");
    const { useHasPermission } = await import("@/lib/hooks/use-permissions");

    const userId = "u1";
    // Role fallback for "auditor" denies process_sales (DEFAULT_GROUP_PERMISSIONS.auditor
    // has no process_sales) - but this user's actual assigned group DOES grant it,
    // exactly the "custom group more permissive than the role tier" case.
    db.run(`INSERT INTO users (id, role, first_name, last_name) VALUES (?, 'auditor', 'Test', 'User')`, [userId]);
    db.run(
      `INSERT INTO permission_groups (id, store_id, name, based_on_role, is_default, permissions) VALUES ('pg1', 'store1', 'Custom', 'auditor', 0, '["process_sales","manage_staff"]')`,
    );
    db.run(`UPDATE users SET permission_group_id = 'pg1' WHERE id = ?`, [userId]);
    localStorage.setItem("dumos_user", JSON.stringify({ id: userId, role: "auditor", first_name: "Test", last_name: "User", username: "test" }));
    sessionStorage.setItem("dumos_session_authenticated", "1");

    function BuggyShortCircuited() {
      // Mirrors the exact pre-fix expression shape.
      const result =
        useHasPermission("process_sales") &&
        (useHasPermission("manage_staff") || false);
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
      await act(async () => {
        root.render(React.createElement(AuthProvider, null, React.createElement(Probe)));
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
