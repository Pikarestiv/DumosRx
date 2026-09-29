import { describe, it, expect, beforeAll, beforeEach, vi } from "vitest";
import initSqlJs, { type Database } from "sql.js";

vi.mock("idb-keyval", () => ({
  get: vi.fn(async () => undefined),
  set: vi.fn(async () => undefined),
}));

const DAY = 24 * 60 * 60 * 1000;

/**
 * The refill side of lib/db/queries/prescriptions.ts was untested: whether a
 * refill dispense actually consumes an authorization and pushes the next due
 * date out by the item's own interval, which items count as "due", and which
 * statuses stamp dispensed_at. All of it decides whether a patient can
 * collect medication they aren't entitled to, or is turned away from one
 * they are.
 */
describe("prescription refill queries", () => {
  let db: Database;
  let core: typeof import("@/lib/db/core");
  let q: typeof import("@/lib/db/queries/prescriptions");

  beforeAll(async () => {
    core = await import("@/lib/db/core");
    q = await import("@/lib/db/queries/prescriptions");

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

  function seedPrescription(
    id: string,
    status: string,
    extra: { storeId?: string } = {},
  ) {
    db.run(
      `INSERT INTO prescriptions (id, prescription_number, patient_name, status, store_id, _deleted)
       VALUES (?, ?, 'Ada', ?, ?, 0)`,
      [id, `RX-${id}`, status, extra.storeId ?? null],
    );
  }

  function seedItem(
    id: string,
    prescriptionId: string,
    opts: {
      authorized?: number;
      used?: number;
      intervalDays?: number | null;
      nextRefill?: string | null;
      deleted?: number;
      storeId?: string | null;
    } = {},
  ) {
    db.run(
      `INSERT INTO prescription_items
        (id, prescription_id, product_name, quantity, refills_authorized, refills_used, refill_interval_days, next_refill_date, store_id, _deleted)
       VALUES (?, ?, 'Panadol', 10, ?, ?, ?, ?, ?, ?)`,
      [
        id,
        prescriptionId,
        opts.authorized ?? 0,
        opts.used ?? 0,
        opts.intervalDays === undefined ? 30 : opts.intervalDays,
        opts.nextRefill ?? null,
        opts.storeId ?? null,
        opts.deleted ?? 0,
      ],
    );
  }

  function itemRow(id: string) {
    const rows = db.exec(
      `SELECT refills_used, next_refill_date FROM prescription_items WHERE id = ?`,
      [id],
    );
    return { used: rows[0].values[0][0] as number, next: rows[0].values[0][1] as string };
  }

  describe("updatePrescriptionStatus", () => {
    it("stamps dispensed_at when the prescription is marked dispensed", async () => {
      seedPrescription("rx1", "ready");
      await q.updatePrescriptionStatus("rx1", "dispensed");
      const rows = db.exec(`SELECT status, dispensed_at FROM prescriptions WHERE id = 'rx1'`);
      expect(rows[0].values[0][0]).toBe("dispensed");
      expect(rows[0].values[0][1]).toBeTruthy();
    });

    it("stamps dispensed_at when the prescription is marked completed", async () => {
      seedPrescription("rx1", "ready");
      await q.updatePrescriptionStatus("rx1", "completed");
      const rows = db.exec(`SELECT dispensed_at FROM prescriptions WHERE id = 'rx1'`);
      expect(rows[0].values[0][0]).toBeTruthy();
    });

    it("leaves dispensed_at alone for any other status, so a reversal doesn't fake a dispense", async () => {
      seedPrescription("rx1", "completed");
      await q.updatePrescriptionStatus("rx1", "ready");
      const rows = db.exec(`SELECT status, dispensed_at FROM prescriptions WHERE id = 'rx1'`);
      expect(rows[0].values[0][0]).toBe("ready");
      expect(rows[0].values[0][1]).toBeNull();
    });
  });

  describe("dispensePrescriptionRefill", () => {
    it("consumes one authorization and pushes the next due date out by the item's interval", async () => {
      seedPrescription("rx1", "completed");
      seedItem("i1", "rx1", { authorized: 3, used: 1, intervalDays: 14 });

      await q.dispensePrescriptionRefill("rx1");

      const { used, next } = itemRow("i1");
      expect(used).toBe(2);
      const daysOut = Math.round((new Date(next).getTime() - Date.now()) / DAY);
      expect(daysOut).toBe(14);
    });

    it("falls back to a 30-day interval when the item declares none", async () => {
      seedPrescription("rx1", "completed");
      seedItem("i1", "rx1", { authorized: 1, used: 0, intervalDays: null });

      await q.dispensePrescriptionRefill("rx1");

      const daysOut = Math.round(
        (new Date(itemRow("i1").next).getTime() - Date.now()) / DAY,
      );
      expect(daysOut).toBe(30);
    });

    it("never touches an item whose refills are already exhausted", async () => {
      seedPrescription("rx1", "completed");
      seedItem("i1", "rx1", { authorized: 2, used: 2, nextRefill: "2020-01-01T00:00:00Z" });

      await q.dispensePrescriptionRefill("rx1");

      const { used, next } = itemRow("i1");
      expect(used).toBe(2);
      expect(next).toBe("2020-01-01T00:00:00Z");
    });

    it("advances only the items that still have refills left on a mixed prescription", async () => {
      seedPrescription("rx1", "completed");
      seedItem("i1", "rx1", { authorized: 2, used: 0 });
      seedItem("i2", "rx1", { authorized: 1, used: 1 });

      await q.dispensePrescriptionRefill("rx1");

      expect(itemRow("i1").used).toBe(1);
      expect(itemRow("i2").used).toBe(1);
    });

    it("stamps the prescription's dispensed_at so the refill counts as filled today", async () => {
      seedPrescription("rx1", "completed");
      seedItem("i1", "rx1", { authorized: 1, used: 0 });

      await q.dispensePrescriptionRefill("rx1");

      const rows = db.exec(`SELECT dispensed_at FROM prescriptions WHERE id = 'rx1'`);
      expect(rows[0].values[0][0]).toBeTruthy();
    });

    it("ignores another prescription's items", async () => {
      seedPrescription("rx1", "completed");
      seedPrescription("rx2", "completed");
      seedItem("i1", "rx1", { authorized: 2, used: 0 });
      seedItem("i2", "rx2", { authorized: 2, used: 0 });

      await q.dispensePrescriptionRefill("rx1");

      expect(itemRow("i1").used).toBe(1);
      expect(itemRow("i2").used).toBe(0);
    });
  });

  describe("getRefillsDue", () => {
    const past = new Date(Date.now() - DAY).toISOString();
    const future = new Date(Date.now() + 5 * DAY).toISOString();

    it("returns an item with refills left whose next date has passed", async () => {
      seedPrescription("rx1", "dispensed");
      seedItem("i1", "rx1", { authorized: 2, used: 0, nextRefill: past });

      const due = await q.getRefillsDue();
      expect(due.map((d) => d.id)).toEqual(["i1"]);
      expect(due[0].patient_name).toBe("Ada");
    });

    it("excludes an item whose next refill is still in the future", async () => {
      seedPrescription("rx1", "dispensed");
      seedItem("i1", "rx1", { authorized: 2, used: 0, nextRefill: future });

      expect(await q.getRefillsDue()).toEqual([]);
    });

    it("excludes an item with no refills remaining even if long overdue", async () => {
      seedPrescription("rx1", "dispensed");
      seedItem("i1", "rx1", { authorized: 2, used: 2, nextRefill: past });

      expect(await q.getRefillsDue()).toEqual([]);
    });

    it("excludes an item with no next refill date recorded", async () => {
      seedPrescription("rx1", "dispensed");
      seedItem("i1", "rx1", { authorized: 2, used: 0, nextRefill: null });

      expect(await q.getRefillsDue()).toEqual([]);
    });

    it("excludes a prescription that hasn't been dispensed yet", async () => {
      seedPrescription("rx1", "pending");
      seedItem("i1", "rx1", { authorized: 2, used: 0, nextRefill: past });

      expect(await q.getRefillsDue()).toEqual([]);
    });

    it("excludes a soft-deleted item", async () => {
      seedPrescription("rx1", "dispensed");
      seedItem("i1", "rx1", { authorized: 2, used: 0, nextRefill: past, deleted: 1 });

      expect(await q.getRefillsDue()).toEqual([]);
    });

    it("returns only the active store's due refills once a store is selected", async () => {
      seedPrescription("rx1", "dispensed", { storeId: "store-a" });
      seedPrescription("rx2", "dispensed", { storeId: "store-b" });
      seedItem("i1", "rx1", { authorized: 2, used: 0, nextRefill: past });
      seedItem("i2", "rx2", { authorized: 2, used: 0, nextRefill: past });

      core.setActiveStoreId("store-a");
      const due = await q.getRefillsDue();
      expect(due.map((d) => d.id)).toEqual(["i1"]);
    });
  });

  describe("getQueueCount", () => {
    it("counts only pending and processing prescriptions", async () => {
      seedPrescription("rx1", "pending");
      seedPrescription("rx2", "processing");
      seedPrescription("rx3", "ready");
      seedPrescription("rx4", "completed");

      expect(await q.getQueueCount()).toBe(2);
    });

    it("counts only the active store's queue", async () => {
      seedPrescription("rx1", "pending", { storeId: "store-a" });
      seedPrescription("rx2", "pending", { storeId: "store-b" });

      core.setActiveStoreId("store-a");
      expect(await q.getQueueCount()).toBe(1);
    });
  });

  describe("getRefillManagementData", () => {
    it("lists refillable items on dispensed or completed prescriptions only", async () => {
      seedPrescription("rx1", "completed");
      seedPrescription("rx2", "dispensed");
      seedPrescription("rx3", "pending");
      seedItem("i1", "rx1", { authorized: 2 });
      seedItem("i2", "rx2", { authorized: 1 });
      seedItem("i3", "rx3", { authorized: 5 });

      const rows = await q.getRefillManagementData();
      expect(rows.map((r) => r.id).sort()).toEqual(["i1", "i2"]);
      expect(rows[0].prescription_number).toBeTruthy();
    });

    it("omits items that were never authorized any refills", async () => {
      seedPrescription("rx1", "completed");
      seedItem("i1", "rx1", { authorized: 0 });

      expect(await q.getRefillManagementData()).toEqual([]);
    });

    it("omits soft-deleted items", async () => {
      seedPrescription("rx1", "completed");
      seedItem("i1", "rx1", { authorized: 2, deleted: 1 });

      expect(await q.getRefillManagementData()).toEqual([]);
    });
  });
});
