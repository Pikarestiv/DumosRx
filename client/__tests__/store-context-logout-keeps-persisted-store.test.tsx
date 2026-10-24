import { describe, it, expect, beforeAll, beforeEach, vi } from "vitest";
import { renderHook, waitFor } from "@testing-library/react";
import initSqlJs, { type Database } from "sql.js";
import React from "react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";

const authState = vi.hoisted(() => ({
  user: null as { id: string; store_id?: string | null } | null,
}));

vi.mock("@/lib/context/auth-context", () => ({
  useAuth: () => ({ user: authState.user, isHydrated: true }),
}));

vi.mock("@sentry/nextjs", () => ({ setUser: vi.fn(), setTag: vi.fn() }));

vi.mock("@/lib/db/sync-engine", () => ({
  sync: vi.fn(() => Promise.resolve({ success: false })),
  syncSubscriptionStatus: vi.fn(() => Promise.resolve({ updated: false })),
  isSyncing: vi.fn(() => false),
}));

vi.mock("@/lib/query-client", () => ({
  queryClient: { cancelQueries: vi.fn(async () => {}), clear: vi.fn() },
}));

vi.mock("@/lib/hooks/use-widget-snapshot-sync", () => ({ useWidgetSnapshotSync: vi.fn() }));
vi.mock("@/lib/hooks/use-widget-deeplink", () => ({ useWidgetDeeplink: vi.fn() }));

describe("store-context active-store persistence on logout", () => {
  let db: Database;
  let core: typeof import("@/lib/db/core");
  let storeContext: typeof import("@/lib/context/store-context");

  beforeAll(async () => {
    core = await import("@/lib/db/core");
    storeContext = await import("@/lib/context/store-context");
    const { SCHEMA_SQL } = await import("@/lib/db/schema");
    const SQL = await initSqlJs({
      locateFile: () => require.resolve("sql.js/dist/sql-wasm.wasm"),
    });
    db = new SQL.Database();
    db.run(SCHEMA_SQL);
    core.__setDatabaseForTesting(db);
  });

  beforeEach(() => {
    db.run(`DELETE FROM stores;`);
    localStorage.clear();
    core.setActiveStoreId(null);
  });

  function wrapper({ children }: { children: React.ReactNode }) {
    const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    return React.createElement(
      QueryClientProvider,
      { client: queryClient },
      React.createElement(storeContext.StoreProvider, null, children),
    );
  }

  it("does not overwrite the store id persisted at staff login with the stale in-memory owner choice when the pinned user logs out", async () => {
    db.run(`INSERT INTO stores (id, name) VALUES ('store-a', 'Store A'), ('store-b', 'Store B')`);
    localStorage.setItem("dumos_active_store_id", "store-a");
    authState.user = { id: "staff-1", store_id: "store-b" };

    const { result, rerender } = renderHook(() => storeContext.useStore(), { wrapper });
    await waitFor(() => expect(result.current.storeProfile?.id).toBe("store-b"));

    localStorage.setItem("dumos_active_store_id", "store-b");
    authState.user = null;
    rerender();

    await waitFor(() => expect(result.current.storeProfile?.id).toBe("store-a"));
    expect(localStorage.getItem("dumos_active_store_id")).toBe("store-b");
  });

  it("still persists a fallback correction when the saved store no longer exists locally", async () => {
    db.run(`INSERT INTO stores (id, name) VALUES ('store-b', 'Store B')`);
    localStorage.setItem("dumos_active_store_id", "store-stale");
    authState.user = null;

    const { result } = renderHook(() => storeContext.useStore(), { wrapper });

    await waitFor(() => expect(result.current.storeProfile?.id).toBe("store-b"));
    await waitFor(() => expect(localStorage.getItem("dumos_active_store_id")).toBe("store-b"));
  });
});
