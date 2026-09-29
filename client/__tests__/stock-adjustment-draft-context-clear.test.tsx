import { describe, it, expect, beforeAll, beforeEach, vi } from "vitest";
import { renderHook, waitFor, act } from "@testing-library/react";
import initSqlJs, { type Database } from "sql.js";
import React from "react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";

/**
 * Regression coverage for FIXED_BUGS.md A-34: the Adjust Stock draft is
 * persisted under one global key, exactly like the POS cart and the
 * cycle-count draft, so it must be cleared on a store switch and on logout.
 * Without that, a half-entered adjustment staged against store A's product
 * ids reappears under store B, or under whichever cashier signs in next on
 * a shared terminal.
 */

vi.mock("@sentry/nextjs", () => ({
  setUser: vi.fn(),
  setTag: vi.fn(),
}));

vi.mock("@/lib/api/client", () => ({
  apiClient: { login: vi.fn(), setToken: vi.fn(), logout: vi.fn(async () => {}) },
}));

vi.mock("@/lib/db/sync-engine", () => ({
  sync: vi.fn(async () => ({ success: true })),
  isSyncing: vi.fn(() => false),
}));

vi.mock("@/lib/query-client", () => ({
  queryClient: {
    cancelQueries: vi.fn(async () => {}),
    invalidateQueries: vi.fn(async () => {}),
    clear: vi.fn(),
  },
}));

vi.mock("@/lib/db", () => ({
  isTauri: vi.fn(() => false),
}));

vi.mock("@/lib/api/token-manager", () => ({
  getToken: vi.fn(() => null),
  clearToken: vi.fn(),
}));

vi.mock("@/lib/native/widget-bridge", () => ({
  mirrorAuthToken: vi.fn(async () => {}),
  clearMirroredAuthToken: vi.fn(async () => {}),
  writeWidgetSnapshot: vi.fn(async () => {}),
  requestPinWidget: vi.fn(async () => {}),
}));

vi.mock("idb-keyval", () => ({
  get: vi.fn(async () => undefined),
  set: vi.fn(async () => undefined),
}));

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn(), replace: vi.fn(), prefetch: vi.fn() }),
  useSearchParams: () => new URLSearchParams(),
  usePathname: () => "/",
}));

describe("Adjust Stock draft is cleared on a context change", () => {
  let db: Database;
  let core: typeof import("@/lib/db/core");
  let draft: typeof import("@/lib/hooks/use-stock-adjustment-draft");
  let useStore: typeof import("@/lib/context/store-context").useStore;
  let StoreProvider: typeof import("@/lib/context/store-context").StoreProvider;
  let useAuth: typeof import("@/lib/context/auth-context").useAuth;
  let AuthProvider: typeof import("@/lib/context/auth-context").AuthProvider;

  beforeAll(async () => {
    core = await import("@/lib/db/core");
    draft = await import("@/lib/hooks/use-stock-adjustment-draft");
    const authContext = await import("@/lib/context/auth-context");
    AuthProvider = authContext.AuthProvider;
    useAuth = authContext.useAuth;
    const storeContext = await import("@/lib/context/store-context");
    useStore = storeContext.useStore;
    StoreProvider = storeContext.StoreProvider;

    const { SCHEMA_SQL } = await import("@/lib/db/schema");
    const SQL = await initSqlJs({
      locateFile: () => require.resolve("sql.js/dist/sql-wasm.wasm"),
    });
    db = new SQL.Database();
    db.run(SCHEMA_SQL);
    core.__setDatabaseForTesting(db);
  });

  beforeEach(() => {
    db.run(`DELETE FROM stores; DELETE FROM users;`);
    localStorage.clear();
    sessionStorage.clear();
    core.setCurrentUser(null);
    core.setActiveStoreId(null);
    draft.useStockAdjustmentDraftStore.getState().clearDraft();
  });

  function stageDraft() {
    const state = draft.useStockAdjustmentDraftStore.getState();
    state.setReason("loss");
    state.setNote("Broken on delivery");
    state.addItem({
      productId: "p1",
      name: "Paracetamol 500mg",
      sku: "PAR-500",
      currentStock: 40,
      quantity: 6,
    });
    expect(draft.useStockAdjustmentDraftStore.getState().items).toHaveLength(1);
  }

  function expectCleared() {
    const state = draft.useStockAdjustmentDraftStore.getState();
    expect(state.items).toHaveLength(0);
    expect(state.note).toBe("");
  }

  function wrapper({ children }: { children: React.ReactNode }) {
    const queryClient = new QueryClient({
      defaultOptions: { queries: { retry: false } },
    });
    return React.createElement(
      QueryClientProvider,
      { client: queryClient },
      React.createElement(AuthProvider, null, React.createElement(StoreProvider, null, children)),
    );
  }

  it("clears the draft when the active store changes", async () => {
    db.run(`INSERT INTO stores (id, name) VALUES ('store-a', 'Store A'), ('store-b', 'Store B')`);
    localStorage.setItem("dumos_active_store_id", "store-a");

    const { result } = renderHook(() => useStore(), { wrapper });
    await waitFor(() => expect(result.current.loading).toBe(false));

    stageDraft();

    act(() => {
      result.current.switchStore("store-b");
    });
    await waitFor(() => expect(result.current.isSwitchingStore).toBe(false));

    expectCleared();
  });

  it("clears the draft on logout", async () => {
    db.run(
      `INSERT INTO users (id, first_name, last_name, username, pin, role, store_id, is_active, _deleted)
       VALUES ('cashier-1', 'Test', 'User', 'cashier1', '1111', 'sales_staff', 'store-a', 1, 0)`,
    );

    const { result } = renderHook(() => useAuth(), { wrapper });

    await act(async () => {
      await result.current.login("cashier1", "1111");
    });

    stageDraft();

    await act(async () => {
      await result.current.logout();
    });

    expectCleared();
  });
});
