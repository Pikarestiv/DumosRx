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

import { ServiceCategoriesDialog } from "@/components/services/service-categories-dialog";
import { getServices } from "@/lib/db/queries/services";

async function freshDb() {
  const core = await import("@/lib/db/core");
  const { SCHEMA_SQL } = await import("@/lib/db/schema");
  const SQL = await initSqlJs({ locateFile: () => require.resolve("sql.js/dist/sql-wasm.wasm") });
  const db = new SQL.Database();
  db.run(SCHEMA_SQL);
  const { runSchemaMigrations, makeSqlJsAdapter } = await import("@/lib/db/schema-migrations");
  await runSchemaMigrations(makeSqlJsAdapter(db));
  core.__setDatabaseForTesting(db);
  db.run(`INSERT INTO services (id, store_id, name, category, price, is_active) VALUES
    ('a', 'store-1', 'BP check', 'Consultation', 500, 1),
    ('b', 'store-1', 'Review', 'consultation', 300, 1),
    ('c', 'store-1', 'Blood test', 'Lab Test', 900, 1),
    ('d', 'store-2', 'Other store', 'Consultation', 100, 1)`);
}

function renderDialog() {
  return render(
    <QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 } } })}>
      <ServiceCategoriesDialog open onOpenChange={() => {}} />
    </QueryClientProvider>,
  );
}

const categoriesOf = async () =>
  Object.fromEntries((await getServices({ storeId: "store-1", activeOnly: false })).map((s) => [s.id, s.category ?? null]));

describe("Service categories dialog", () => {
  beforeEach(freshDb);

  it("lists each category once with how many services use it", async () => {
    renderDialog();

    expect(await screen.findByText("Consultation")).toBeTruthy();
    expect(screen.getByText("2 services")).toBeTruthy();
    expect(screen.getByText("Lab Test")).toBeTruthy();
    expect(screen.getByText("1 service")).toBeTruthy();
  });

  it("renames a category on every service that uses it, in this store only", async () => {
    renderDialog();
    fireEvent.click(await screen.findByRole("button", { name: "Rename Consultation" }));
    fireEvent.change(screen.getByLabelText("New name for Consultation"), { target: { value: "Clinic Visit" } });
    fireEvent.click(screen.getByRole("button", { name: "Save name" }));

    await waitFor(async () => expect((await categoriesOf()).a).toBe("Clinic Visit"));
    const after = await categoriesOf();
    expect(after.b).toBe("Clinic Visit");
    expect(after.c).toBe("Lab Test");
    const otherStore = await getServices({ storeId: "store-2", activeOnly: false });
    expect(otherStore.find((s) => s.id === "d")?.category).toBe("Consultation");
  });

  it("removes a category after confirmation and leaves the services uncategorised", async () => {
    renderDialog();
    fireEvent.click(await screen.findByRole("button", { name: "Remove Lab Test" }));
    fireEvent.click(await screen.findByRole("button", { name: "Remove" }));

    await waitFor(async () => expect((await categoriesOf()).c).toBeNull());
    expect((await categoriesOf()).a).toBe("Consultation");
  });
});
