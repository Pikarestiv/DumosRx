import { describe, it, expect, beforeAll, beforeEach, vi } from "vitest";
import initSqlJs, { type Database } from "sql.js";

vi.mock("idb-keyval", () => ({
  get: vi.fn(() => Promise.resolve(undefined)),
  set: vi.fn(() => Promise.resolve(undefined)),
}));

const STORE_ID = "store-1";

describe("correctBatchDetails", () => {
  let db: Database;
  let correctBatchDetails: typeof import("@/lib/db/queries/batch-details-correction").correctBatchDetails;
  let getProductHistory: typeof import("@/lib/db/queries/products").getProductHistory;

  beforeAll(async () => {
    const core = await import("@/lib/db/core");
    ({ correctBatchDetails } = await import("@/lib/db/queries/batch-details-correction"));
    ({ getProductHistory } = await import("@/lib/db/queries/products"));
    const { SCHEMA_SQL } = await import("@/lib/db/schema");
    const SQL = await initSqlJs({ locateFile: () => require.resolve("sql.js/dist/sql-wasm.wasm") });
    db = new SQL.Database();
    db.run(SCHEMA_SQL);
    db.run(`ALTER TABLE stock_batches ADD COLUMN store_id TEXT`);
    db.run(`ALTER TABLE products ADD COLUMN store_id TEXT`);
    core.__setDatabaseForTesting(db);
    core.setActiveStoreId(STORE_ID);
    core.setCurrentUser({ id: "owner-1", first_name: "Cynthia", last_name: "Agidi", role: "store_owner" });
  });

  beforeEach(() => {
    db.run(`DELETE FROM stock_batches; DELETE FROM products; DELETE FROM _sync_queue; DELETE FROM audit_logs;`);
    db.run(`INSERT INTO products (id, name, _deleted, store_id) VALUES ('prod-1', 'Amoxil 500mg', 0, '${STORE_ID}')`);
    db.run(
      `INSERT INTO stock_batches (id, product_id, batch_number, expiry_date, manufacture_date, quantity, cost_price, is_active, _deleted, _version, store_id)
       VALUES ('batch-1', 'prod-1', 'LOT-7', '2027-03-01', '2026-01-15', 20, 1200, 1, 0, 4, '${STORE_ID}')`,
    );
  });

  const scalar = (sql: string) => db.exec(sql)[0]?.values[0]?.[0];
  const batchRow = () => db.exec(`SELECT batch_number, expiry_date, manufacture_date, quantity, cost_price FROM stock_batches WHERE id = 'batch-1'`)[0].values[0];

  it("changes the expiry and leaves the lot, quantity and cost alone", async () => {
    await correctBatchDetails("batch-1", { expiry_date: "2027-06-30" });

    expect(batchRow()).toEqual(["LOT-7", "2027-06-30", "2026-01-15", 20, 1200]);
  });

  it("adds an expiry to a batch that had none and clears one that it had", async () => {
    db.run(`UPDATE stock_batches SET expiry_date = NULL`);
    await correctBatchDetails("batch-1", { expiry_date: "2028-01-31" });
    expect(scalar(`SELECT expiry_date FROM stock_batches WHERE id = 'batch-1'`)).toBe("2028-01-31");

    await correctBatchDetails("batch-1", { expiry_date: "" });
    expect(scalar(`SELECT expiry_date FROM stock_batches WHERE id = 'batch-1'`)).toBeNull();
  });

  it("fixes the lot number and the manufacture date in one save", async () => {
    await correctBatchDetails("batch-1", { batch_number: "  LOT-8  ", manufacture_date: "2026-02-01" });

    expect(batchRow().slice(0, 3)).toEqual(["LOT-8", "2027-03-01", "2026-02-01"]);
  });

  it("only touches the fields it was given", async () => {
    await correctBatchDetails("batch-1", { batch_number: "LOT-8" });

    expect(batchRow().slice(0, 3)).toEqual(["LOT-8", "2027-03-01", "2026-01-15"]);
  });

  it("queues an UPDATE carrying only the changed field and the batch's current version", async () => {
    await correctBatchDetails("batch-1", { expiry_date: "2027-06-30" });

    const payload = JSON.parse(
      String(scalar(`SELECT payload FROM _sync_queue WHERE table_name = 'stock_batches' AND record_id = 'batch-1' AND operation = 'UPDATE'`)),
    );
    expect(payload.expiry_date).toBe("2027-06-30");
    expect(payload._version).toBe(4);
    expect(payload).not.toHaveProperty("quantity");
    expect(payload).not.toHaveProperty("cost_price");
  });

  it("records who changed what, from what, to what", async () => {
    await correctBatchDetails("batch-1", { expiry_date: "2027-06-30", batch_number: "LOT-8" });

    const [action, userId, details] = db.exec(
      `SELECT action, user_id, details FROM audit_logs WHERE table_name = 'stock_batches' AND record_id = 'batch-1'`,
    )[0].values[0];
    expect(action).toBe("BATCH_DETAILS_CORRECTED");
    expect(userId).toBe("owner-1");
    expect(JSON.parse(String(details))).toMatchObject({
      product_id: "prod-1",
      batch_number: "LOT-7",
      changes: { expiry_date: { from: "2027-03-01", to: "2027-06-30" }, batch_number: { from: "LOT-7", to: "LOT-8" } },
    });
  });

  it("shows the correction in the product's own history", async () => {
    await correctBatchDetails("batch-1", { expiry_date: "2027-06-30" });

    const { auditLogs } = await getProductHistory("prod-1");
    expect(auditLogs.map((log) => log.action)).toContain("BATCH_DETAILS_CORRECTED");
  });

  it("writes nothing when the details are unchanged, even if padded with spaces", async () => {
    await correctBatchDetails("batch-1", { batch_number: " LOT-7 ", expiry_date: "2027-03-01" });

    expect(scalar(`SELECT COUNT(*) FROM _sync_queue`)).toBe(0);
    expect(scalar(`SELECT COUNT(*) FROM audit_logs`)).toBe(0);
    expect(scalar(`SELECT _version FROM stock_batches WHERE id = 'batch-1'`)).toBe(4);
  });

  it.each([
    ["a date that does not exist", { expiry_date: "2027-02-30" }, /valid expiry/i],
    ["a date in the wrong shape", { expiry_date: "30/06/2027" }, /valid expiry/i],
    ["a manufacture date that does not exist", { manufacture_date: "2026-13-01" }, /valid manufacture/i],
    ["a manufacture date after the expiry", { manufacture_date: "2027-04-01" }, /before the expiry/i],
    ["an expiry before the manufacture date", { expiry_date: "2025-12-31" }, /before the expiry/i],
    ["a lot number that is too long", { batch_number: "x".repeat(51) }, /50 characters/i],
  ])("rejects %s without writing anything", async (_label, details, message) => {
    await expect(correctBatchDetails("batch-1", details)).rejects.toThrow(message);

    expect(batchRow().slice(0, 3)).toEqual(["LOT-7", "2027-03-01", "2026-01-15"]);
    expect(scalar(`SELECT COUNT(*) FROM _sync_queue`)).toBe(0);
    expect(scalar(`SELECT COUNT(*) FROM audit_logs`)).toBe(0);
  });

  it("allows an expiry in the past, so an expired batch can be corrected", async () => {
    await correctBatchDetails("batch-1", { expiry_date: "2026-02-01" });

    expect(scalar(`SELECT expiry_date FROM stock_batches WHERE id = 'batch-1'`)).toBe("2026-02-01");
  });

  it("refuses a deleted or unknown batch", async () => {
    db.run(`UPDATE stock_batches SET _deleted = 1 WHERE id = 'batch-1'`);

    await expect(correctBatchDetails("batch-1", { expiry_date: "2027-06-30" })).rejects.toThrow(/no longer exists/i);
    await expect(correctBatchDetails("nope", { expiry_date: "2027-06-30" })).rejects.toThrow(/no longer exists/i);
  });
});
