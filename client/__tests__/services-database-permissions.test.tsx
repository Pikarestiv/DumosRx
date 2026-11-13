import { describe, it, expect, vi, beforeAll, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import initSqlJs from "sql.js";
import React from "react";

vi.mock("idb-keyval", () => ({
  get: vi.fn(() => Promise.resolve(undefined)),
  set: vi.fn(() => Promise.resolve(undefined)),
}));

if (!globalThis.ResizeObserver) {
  globalThis.ResizeObserver = class {
    observe() {}
    unobserve() {}
    disconnect() {}
  } as unknown as typeof ResizeObserver;
}

let searchParams = new URLSearchParams();
vi.mock("next/navigation", () => ({
  useSearchParams: () => searchParams,
  useRouter: () => ({ replace: vi.fn() }),
}));

vi.mock("@/hooks/use-media-query", () => ({ useMediaQuery: () => true }));

vi.mock("@/lib/context/store-context", () => ({
  useStore: () => ({ activeStoreId: "store-1", storeProfile: { currency: "NGN" } }),
}));

const granted = new Set<string>();
vi.mock("@/lib/context/auth-context", () => ({
  useAuth: () => ({ canManageStockBatch: granted.has("manage_products") }),
}));
vi.mock("@/lib/hooks/use-permissions", () => ({
  useHasPermission: (key: string) => granted.has(key),
}));

import { ServicesDatabase } from "@/components/services/services-database";

function renderDatabase() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 } } });
  return render(
    <QueryClientProvider client={client}>
      <ServicesDatabase />
    </QueryClientProvider>,
  );
}

describe("ServicesDatabase permission gating", () => {
  let db: import("sql.js").Database;

  beforeAll(async () => {
    const core = await import("@/lib/db/core");
    const { SCHEMA_SQL } = await import("@/lib/db/schema");
    const SQL = await initSqlJs({ locateFile: () => require.resolve("sql.js/dist/sql-wasm.wasm") });
    db = new SQL.Database();
    db.run(SCHEMA_SQL);
    const { runSchemaMigrations, makeSqlJsAdapter } = await import("@/lib/db/schema-migrations");
    await runSchemaMigrations(makeSqlJsAdapter(db));
    core.__setDatabaseForTesting(db);
  });

  beforeEach(() => {
    granted.clear();
    searchParams = new URLSearchParams();
    db.run("DELETE FROM services");
    db.run(`INSERT INTO services (id, store_id, name, price, is_active) VALUES ('svc-1', 'store-1', 'Haircut', 1000, 1)`);
  });

  it("offers no edit, delete or add to a user without manage_products or delete_products", async () => {
    searchParams = new URLSearchParams("action=add");
    renderDatabase();

    expect(await screen.findByText("Haircut")).toBeTruthy();
    expect(screen.queryByRole("button", { name: /edit haircut/i })).toBeNull();
    expect(screen.queryByRole("button", { name: /delete haircut/i })).toBeNull();
    expect(screen.queryByRole("dialog")).toBeNull();
  });

  it("offers edit but not delete to a user with manage_products only", async () => {
    granted.add("manage_products");
    renderDatabase();

    expect(await screen.findByRole("button", { name: /edit haircut/i })).toBeTruthy();
    expect(screen.queryByRole("button", { name: /delete haircut/i })).toBeNull();
  });

  it("offers delete to a user with delete_products", async () => {
    granted.add("manage_products");
    granted.add("delete_products");
    renderDatabase();

    expect(await screen.findByRole("button", { name: /delete haircut/i })).toBeTruthy();
  });

  it("hides the empty-state Add Service action from a user without manage_products", async () => {
    db.run("DELETE FROM services");
    renderDatabase();

    expect(await screen.findByText("No services configured")).toBeTruthy();
    expect(screen.queryByRole("button", { name: /add service/i })).toBeNull();
  });
});
