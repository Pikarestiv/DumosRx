import { describe, it, expect, beforeAll, beforeEach, vi } from "vitest";
import initSqlJs, { type Database } from "sql.js";

vi.mock("idb-keyval", () => ({
  get: vi.fn(() => Promise.resolve(undefined)),
  set: vi.fn(() => Promise.resolve(undefined)),
}));

import {
  createService,
  getServices,
  getServiceById,
  updateServiceDetails,
  deleteService,
} from "@/lib/db/queries/services";
import { queryKeys } from "@/lib/query-keys";
import { generateStaticParams } from "@/app/(dashboard)/inventory/[tab]/page";

const STORE_ID = "store-test-1";

describe("Services Inventory Management & Tab Routing", () => {
  let db: Database;
  let core: typeof import("@/lib/db/core");

  beforeAll(async () => {
    core = await import("@/lib/db/core");
    const { SCHEMA_SQL } = await import("@/lib/db/schema");
    const SQL = await initSqlJs({
      locateFile: () => require.resolve("sql.js/dist/sql-wasm.wasm"),
    });
    db = new SQL.Database();
    db.run(SCHEMA_SQL);
    const { runSchemaMigrations, makeSqlJsAdapter } = await import("@/lib/db/schema-migrations");
    await runSchemaMigrations(makeSqlJsAdapter(db));
    core.__setDatabaseForTesting(db);
    core.setActiveStoreId(STORE_ID);
  });

  beforeEach(() => {
    db.run("DELETE FROM services;");
  });

  it("includes services in inventory static tab parameters", () => {
    const params = generateStaticParams();
    const tabs = params.map((p) => p.tab);
    expect(tabs).toContain("services");
    expect(tabs).toContain("catalog");
    expect(tabs).toContain("overview");
  });

  it("declares services table meta tag in queryKeys factory", () => {
    const keyDef = queryKeys.services.all();
    expect(keyDef.meta.tables).toEqual(["services"]);
  });

  it("creates, reads, updates, and soft deletes catalog services", async () => {
    const srvId = await createService({
      store_id: STORE_ID,
      name: "Full Body Massage",
      code: "SRV-SPA-01",
      category: "Spa Treatments",
      price: 25000,
      description: "60-minute therapeutic massage",
      is_active: 1,
    });

    expect(srvId).toBeDefined();

    const created = await getServiceById(srvId);
    expect(created).not.toBeNull();
    expect(created?.name).toBe("Full Body Massage");
    expect(created?.price).toBe(25000);
    expect(created?.category).toBe("Spa Treatments");

    await updateServiceDetails(srvId, {
      price: 28000,
      is_active: 0,
    });

    const activeOnly = await getServices({ storeId: STORE_ID, activeOnly: true });
    expect(activeOnly).toHaveLength(0);

    const allServices = await getServices({ storeId: STORE_ID, activeOnly: false });
    expect(allServices).toHaveLength(1);
    expect(allServices[0].price).toBe(28000);
    expect(allServices[0].is_active).toBe(0);

    await deleteService(srvId);
    const afterDelete = await getServices({ storeId: STORE_ID, activeOnly: false });
    expect(afterDelete).toHaveLength(0);
  });
});
