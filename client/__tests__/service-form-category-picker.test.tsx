import { describe, it, expect, vi, beforeEach } from "vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import initSqlJs from "sql.js";

vi.mock("idb-keyval", () => ({
  get: vi.fn(() => Promise.resolve(undefined)),
  set: vi.fn(() => Promise.resolve(undefined)),
}));
vi.mock("@/lib/context/store-context", () => ({
  useStore: () => ({ activeStoreId: "store-1", storeProfile: { uppercase_display_enabled: 0 } }),
}));

import { ServiceFormDialog } from "@/components/services/service-form-dialog";
import { getServices } from "@/lib/db/queries/services";

beforeEach(async () => {
  vi.stubGlobal("ResizeObserver", class { observe() {} unobserve() {} disconnect() {} });
  const core = await import("@/lib/db/core");
  const { SCHEMA_SQL } = await import("@/lib/db/schema");
  const SQL = await initSqlJs({ locateFile: () => require.resolve("sql.js/dist/sql-wasm.wasm") });
  const db = new SQL.Database();
  db.run(SCHEMA_SQL);
  const { runSchemaMigrations, makeSqlJsAdapter } = await import("@/lib/db/schema-migrations");
  await runSchemaMigrations(makeSqlJsAdapter(db));
  core.__setDatabaseForTesting(db);
  db.run(`INSERT INTO services (id, store_id, name, category, price, is_active) VALUES
    ('a', 'store-1', 'BP check', 'Consultation', 500, 1)`);
});

function renderForm() {
  return render(
    <QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 } } })}>
      <ServiceFormDialog open onOpenChange={() => {}} />
    </QueryClientProvider>,
  );
}

describe("Service form category picker", () => {
  it("suggests the categories already used by this store's services", async () => {
    renderForm();
    fireEvent.focus(screen.getByRole("combobox"));

    expect(await screen.findByRole("option", { name: "Consultation" })).toBeTruthy();
  });

  it("saves a differently cased category under the existing spelling", async () => {
    renderForm();
    fireEvent.focus(screen.getByRole("combobox"));
    await screen.findByRole("option", { name: "Consultation" });
    fireEvent.change(screen.getByLabelText(/Service Name/i), { target: { value: "Follow-up" } });
    fireEvent.change(screen.getByRole("combobox"), { target: { value: "consultation" } });
    fireEvent.change(screen.getByLabelText(/Standard Price/i), { target: { value: "400" } });
    fireEvent.click(screen.getByRole("button", { name: /save|add service|create/i }));

    await waitFor(async () => {
      const saved = (await getServices({ storeId: "store-1", activeOnly: false })).find((s) => s.name === "Follow-up");
      expect(saved?.category).toBe("Consultation");
    });
  });
});
