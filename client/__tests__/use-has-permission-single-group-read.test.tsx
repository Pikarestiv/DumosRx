import { describe, it, expect, beforeEach, vi } from "vitest";
import React, { act } from "react";
import { createRoot, type Root } from "react-dom/client";

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
  queryClient: {
    cancelQueries: vi.fn(async () => {}),
    clear: vi.fn(),
    invalidateQueries: vi.fn(async () => {}),
  },
}));
vi.mock("@/lib/db", () => ({ isTauri: vi.fn(() => false) }));
vi.mock("@/lib/api/token-manager", () => ({ getToken: vi.fn(() => null) }));
vi.mock("@/lib/native/widget-bridge", () => ({ mirrorAuthToken: vi.fn() }));
vi.mock("@/lib/db/local-database", () => ({
  setCurrentUser: vi.fn(),
  logAction: vi.fn(async () => {}),
}));

const getUserPermissionGroup = vi.fn(async () => ({
  id: "pg1",
  permissions: ["process_sales", "manage_products"],
}));

vi.mock("@/lib/db/queries/permission-groups", () => ({
  getUserPermissionGroup,
  ensurePermissionGroupsSeeded: vi.fn(async () => {}),
}));

/**
 * useHasPermission used to keep its own useState/useEffect, its own
 * getUserPermissionGroup() query and its own `dumos_sync_completed` listener -
 * duplicating state AuthContext already maintained. With 26+ call sites that
 * meant 26+ independent synchronous sql.js reads per sync cycle on the main
 * thread, and 26+ copies of the same state that could transiently disagree with
 * each other and with AuthContext's own isAdmin/canManageStockBatch booleans.
 *
 * AuthContext is now the single owner. These pin that: one read for any number
 * of call sites, and every call site agreeing with AuthContext.
 */
describe("useHasPermission reads one shared permission group", () => {
  let container: HTMLDivElement;
  let root: Root;

  beforeEach(() => {
    (globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
    getUserPermissionGroup.mockClear();
    localStorage.setItem(
      "dumos_user",
      JSON.stringify({ id: "u1", role: "manager", first_name: "T", last_name: "U", username: "t" }),
    );
    sessionStorage.setItem("dumos_session_authenticated", "1");
    container = document.createElement("div");
    document.body.appendChild(container);
  });

  it("queries the group once no matter how many call sites ask, and agrees with AuthContext", async () => {
    const { AuthProvider, useAuth } = await import("@/lib/context/auth-context");
    const { useHasPermission } = await import("@/lib/hooks/use-permissions");

    function ManyCallSites() {
      const { canManageStockBatch } = useAuth();
      const a = useHasPermission("process_sales");
      const b = useHasPermission("manage_products");
      const c = useHasPermission("manage_products");
      const d = useHasPermission(["process_sales", "manage_staff"]);
      const e = useHasPermission(["process_sales", "manage_staff"], "all");

      return React.createElement(
        "div",
        null,
        JSON.stringify({ a, b, c, d, e, contextAgrees: b === canManageStockBatch }),
      );
    }

    root = createRoot(container);
    await act(async () => {
      root.render(React.createElement(AuthProvider, null, React.createElement(ManyCallSites)));
    });
    await act(async () => {
      await new Promise((r) => setTimeout(r, 0));
      await new Promise((r) => setTimeout(r, 0));
    });

    const state = JSON.parse(container.textContent || "{}");

    expect(state).toEqual({
      a: true,
      b: true,
      c: true,
      d: true,
      // "all" mode: manage_staff is not in the group, so this must deny.
      e: false,
      contextAgrees: true,
    });

    // The whole point: one read for five call sites plus AuthContext itself.
    expect(getUserPermissionGroup).toHaveBeenCalledTimes(1);

    act(() => root.unmount());
    container.remove();
  });
});
