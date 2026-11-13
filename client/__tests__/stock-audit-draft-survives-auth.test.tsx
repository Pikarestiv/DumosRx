import { describe, it, expect, beforeAll, beforeEach, vi } from "vitest";
import { renderHook, act, waitFor } from "@testing-library/react";
import initSqlJs, { type Database } from "sql.js";
import React from "react";

vi.mock("@sentry/nextjs", () => ({ setUser: vi.fn(), setTag: vi.fn() }));
vi.mock("@/lib/api/client", () => ({
  apiClient: { login: vi.fn(), setToken: vi.fn() },
}));
vi.mock("@/lib/db/sync-engine", () => ({
  sync: vi.fn(() => Promise.resolve({ success: true })),
  isSyncing: vi.fn(() => false),
}));
vi.mock("@/lib/query-client", () => ({
  queryClient: { cancelQueries: vi.fn(async () => {}), clear: vi.fn() },
}));
vi.mock("@/lib/db", () => ({ isTauri: vi.fn(() => false) }));
vi.mock("@/lib/api/token-manager", () => ({ getToken: vi.fn(() => null) }));
vi.mock("@/lib/native/widget-bridge", () => ({ mirrorAuthToken: vi.fn() }));
vi.mock("idb-keyval", () => ({
  get: vi.fn(() => Promise.resolve(undefined)),
  set: vi.fn(() => Promise.resolve(undefined)),
}));

const COUNTED_ROW = {
  id: "prod-1",
  name: "Amoxil 500mg",
  sku: "AMX",
  category: "Antibiotics",
  systemQty: 20,
  countedQty: 17,
  counted: true,
};

describe("an unfinished cycle count survives sign-out and a user switch", () => {
  let db: Database;
  let core: typeof import("@/lib/db/core");
  let auth: typeof import("@/lib/context/auth-context");
  let drafts: typeof import("@/lib/hooks/use-stock-audit-draft");

  beforeAll(async () => {
    core = await import("@/lib/db/core");
    auth = await import("@/lib/context/auth-context");
    drafts = await import("@/lib/hooks/use-stock-audit-draft");
    const { SCHEMA_SQL } = await import("@/lib/db/schema");
    const SQL = await initSqlJs({
      locateFile: () => require.resolve("sql.js/dist/sql-wasm.wasm"),
    });
    db = new SQL.Database();
    db.run(SCHEMA_SQL);
    core.__setDatabaseForTesting(db);
  });

  beforeEach(() => {
    db.run("DELETE FROM users; DELETE FROM stock_audit_drafts;");
    localStorage.clear();
    sessionStorage.clear();
    core.setCurrentUser(null);
    core.setActiveStoreId(null);
    drafts.useStockAuditDraftStore.setState({
      items: [],
      drafts: {},
      activeStoreId: null,
      loadedStoreId: null,
    });
    for (const [id, name, pin] of [
      ["cashier-1", "cashier1", "1111"],
      ["cashier-2", "cashier2", "2222"],
    ]) {
      db.run(
        `INSERT INTO users (id, first_name, last_name, username, pin, role, store_id, is_active, _deleted)
         VALUES (?, 'Test', 'User', ?, ?, 'sales_staff', 'store-a', 1, 0)`,
        [id, name, pin],
      );
    }
  });

  function wrapper({ children }: { children: React.ReactNode }) {
    return React.createElement(auth.AuthProvider, null, children);
  }

  function savedDraftRows(): number {
    const res = db.exec(
      "SELECT items_json FROM stock_audit_drafts WHERE store_id = 'store-a'",
    );
    if (res.length === 0) return 0;
    const items = JSON.parse(res[0].values[0][0] as string) as { counted?: boolean }[];
    return items.filter((i) => i.counted).length;
  }

  async function stageCount() {
    drafts.useStockAuditDraftStore.getState().setActiveStoreId("store-a");
    await waitFor(() =>
      expect(drafts.useStockAuditDraftStore.getState().loadedStoreId).toBe("store-a"),
    );
    drafts.useStockAuditDraftStore.getState().setItems([COUNTED_ROW]);
  }

  it("keeps the counted rows in memory and in SQLite through logout()", async () => {
    const { result } = renderHook(() => auth.useAuth(), { wrapper });
    await act(async () => {
      await result.current.login("cashier1", "1111");
    });
    await stageCount();

    act(() => result.current.logout());

    expect(drafts.hasActiveStockAuditCount("store-a")).toBe(true);
    await waitFor(() => expect(savedDraftRows()).toBe(1));
  });

  it("keeps the counted rows when a different user signs in on the lock screen", async () => {
    const { result } = renderHook(() => auth.useAuth(), { wrapper });
    await act(async () => {
      await result.current.login("cashier1", "1111");
    });
    await stageCount();

    await act(async () => {
      expect(await result.current.login("cashier2", "2222")).toBe(true);
    });

    expect(drafts.hasActiveStockAuditCount("store-a")).toBe(true);
    await waitFor(() => expect(savedDraftRows()).toBe(1));
  });
});
