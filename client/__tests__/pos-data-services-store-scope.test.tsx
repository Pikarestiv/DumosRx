import { describe, it, expect, vi, beforeAll } from "vitest";
import { renderHook, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import initSqlJs from "sql.js";
import React from "react";

vi.mock("idb-keyval", () => ({
  get: vi.fn(() => Promise.resolve(undefined)),
  set: vi.fn(() => Promise.resolve(undefined)),
}));

vi.mock("@/lib/context/auth-context", () => ({
  useAuth: () => ({ user: { id: "u1" } }),
}));

vi.mock("@/lib/hooks/use-permissions", () => ({
  useHasPermission: () => true,
}));

import { usePOSData } from "@/lib/hooks/use-pos-data";

const sharedClient = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 } } });

function wrapper({ children }: { children: React.ReactNode }) {
  return React.createElement(QueryClientProvider, { client: sharedClient }, children);
}

describe("usePOSData services", () => {
  let core: typeof import("@/lib/db/core");

  beforeAll(async () => {
    core = await import("@/lib/db/core");
    const { SCHEMA_SQL } = await import("@/lib/db/schema");
    const SQL = await initSqlJs({ locateFile: () => require.resolve("sql.js/dist/sql-wasm.wasm") });
    const db = new SQL.Database();
    db.run(SCHEMA_SQL);
    const { runSchemaMigrations, makeSqlJsAdapter } = await import("@/lib/db/schema-migrations");
    await runSchemaMigrations(makeSqlJsAdapter(db));
    core.__setDatabaseForTesting(db);
    db.run(`INSERT INTO services (id, store_id, name, price, is_active) VALUES
      ('svc-a', 'store-a', 'Haircut', 1000, 1), ('svc-b', 'store-b', 'Massage', 2000, 1)`);
  });

  it("lists only the active store's services and does not serve one store's cache to another", async () => {
    core.setActiveStoreId("store-a");
    const first = renderHook(() => usePOSData(), { wrapper });
    await waitFor(() => expect(first.result.current.loadingServices).toBe(false));
    expect(first.result.current.services.map((s) => s.id)).toEqual(["svc-a"]);

    core.setActiveStoreId("store-b");
    const second = renderHook(() => usePOSData(), { wrapper });
    await waitFor(() => expect(second.result.current.loadingServices).toBe(false));
    expect(second.result.current.services.map((s) => s.id)).toEqual(["svc-b"]);
  });
});
