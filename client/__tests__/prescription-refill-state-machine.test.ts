import { describe, it, expect, beforeAll, beforeEach, vi } from "vitest";
import initSqlJs, { type Database } from "sql.js";

vi.mock("idb-keyval", () => ({
  get: vi.fn(() => Promise.resolve(undefined)),
  set: vi.fn(() => Promise.resolve(undefined)),
}));

describe("prescription dispense & refill implicit state machine", () => {
  let db: Database;
  let core: typeof import("@/lib/db/core");
  let prescriptions: typeof import("@/lib/db/queries/prescriptions");

  beforeAll(async () => {
    core = await import("@/lib/db/core");
    prescriptions = await import("@/lib/db/queries/prescriptions");

    const { SCHEMA_SQL } = await import("@/lib/db/schema");
    const SQL = await initSqlJs({
      locateFile: () => require.resolve("sql.js/dist/sql-wasm.wasm"),
    });
    db = new SQL.Database();
    db.run(SCHEMA_SQL);
    const { runSchemaMigrations, makeSqlJsAdapter } = await import(
      "@/lib/db/schema-migrations"
    );
    await runSchemaMigrations(makeSqlJsAdapter(db));
    core.__setDatabaseForTesting(db);
  });

  beforeEach(() => {
    db.run(`DELETE FROM prescriptions; DELETE FROM prescription_items; DELETE FROM audit_logs;`);
    core.setActiveStoreId(null);
  });

  function seedPrescription(id: string, status: string, dispensedAt: string | null = null) {
    db.run(
      `INSERT INTO prescriptions (id, prescription_number, patient_name, status, dispensed_at, store_id, _deleted)
       VALUES (?, ?, 'Chidi Patient', ?, ?, 'store-1', 0)`,
      [id, `RX-${id}`, status, dispensedAt],
    );
  }

  function seedItem(
    id: string,
    prescriptionId: string,
    authorized: number,
    used: number,
  ) {
    db.run(
      `INSERT INTO prescription_items (id, prescription_id, product_name, refills_authorized, refills_used, _deleted)
       VALUES (?, ?, 'Amoxicillin 500mg', ?, ?, 0)`,
      [id, prescriptionId, authorized, used],
    );
  }

  it("reverting an initial dispense resets status to ready and clears dispensed_at", async () => {
    const rxId = "rx-initial";
    seedPrescription(rxId, "dispensed", "2026-11-10T10:00:00Z");
    seedItem("item-1", rxId, 3, 0);

    await prescriptions.revertPrescriptionDispense(rxId, false);

    const [rx] = await core.query<{ status: string; dispensed_at: string | null }>(
      "SELECT status, dispensed_at FROM prescriptions WHERE id = ?",
      [rxId],
    );

    expect(rx.status).toBe("ready");
    expect(rx.dispensed_at).toBeNull();

    const [item] = await core.query<{ refills_used: number }>(
      "SELECT refills_used FROM prescription_items WHERE id = ?",
      ["item-1"],
    );
    expect(item.refills_used).toBe(0);
  });

  it("reverting a refill rolls back refills_used and keeps prescription status as dispensed", async () => {
    const rxId = "rx-refill";
    seedPrescription(rxId, "dispensed", "2026-11-01T10:00:00Z");
    seedItem("item-refill-1", rxId, 3, 2);

    await prescriptions.revertPrescriptionDispense(rxId, true);

    const [rx] = await core.query<{ status: string; dispensed_at: string | null }>(
      "SELECT status, dispensed_at FROM prescriptions WHERE id = ?",
      [rxId],
    );
    expect(rx.status).toBe("dispensed");
    expect(rx.dispensed_at).toBe("2026-11-01T10:00:00Z");

    const [item] = await core.query<{ refills_used: number }>(
      "SELECT refills_used FROM prescription_items WHERE id = ?",
      ["item-refill-1"],
    );
    expect(item.refills_used).toBe(1);
  });

  it("reverting a refill never decrements refills_used below zero", async () => {
    const rxId = "rx-zero";
    seedPrescription(rxId, "dispensed", "2026-11-01T10:00:00Z");
    seedItem("item-zero-1", rxId, 2, 0);

    await prescriptions.revertPrescriptionDispense(rxId, true);

    const [item] = await core.query<{ refills_used: number }>(
      "SELECT refills_used FROM prescription_items WHERE id = ?",
      ["item-zero-1"],
    );
    expect(item.refills_used).toBe(0);
  });
});
