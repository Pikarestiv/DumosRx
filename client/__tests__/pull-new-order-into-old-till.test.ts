import { describe, it, expect, beforeAll, vi } from "vitest";
import initSqlJs, { type Database } from "sql.js";

vi.mock("idb-keyval", () => ({
  get: vi.fn(() => Promise.resolve(undefined)),
  set: vi.fn(() => Promise.resolve(undefined)),
}));
vi.mock("@/lib/api/client", () => ({ apiClient: { pullChanges: vi.fn() } }));

describe("a till whose local schema predates the draft lock pulls an order written by this build", () => {
  let db: Database;
  let pullChanges: typeof import("@/lib/db/sync-engine/pull").pullChanges;
  let apiClient: { pullChanges: ReturnType<typeof vi.fn> };

  beforeAll(async () => {
    const core = await import("@/lib/db/core");
    ({ pullChanges } = await import("@/lib/db/sync-engine/pull"));
    ({ apiClient } = (await import("@/lib/api/client")) as unknown as { apiClient: { pullChanges: ReturnType<typeof vi.fn> } });
    const { SCHEMA_SQL } = await import("@/lib/db/schema");
    const SQL = await initSqlJs({ locateFile: () => require.resolve("sql.js/dist/sql-wasm.wasm") });
    db = new SQL.Database();
    db.run(SCHEMA_SQL);
    for (const column of ["editing_device_id", "editing_device_label", "editing_user_id", "editing_at"]) {
      db.run(`ALTER TABLE purchase_orders DROP COLUMN ${column}`);
    }
    core.__setDatabaseForTesting(db);
  });

  it("stores the order and its closed-short status, and simply leaves out the lock columns it has no place for", async () => {
    apiClient.pullChanges.mockResolvedValueOnce({
      success: true,
      changes: {
        purchase_orders: [{
          id: "po1", supplier_id: "s1", status: "closed", type: "immediate", payment_status: "paid", amount_paid: 7000, total_amount: 7000,
          editing_device_id: "DRX-NEW", editing_device_label: "Counter 2", editing_user_id: "u1", editing_at: "2026-11-19T10:00:00.000Z",
          updated_at: "2026-11-19T10:00:00Z", _version: 3, _deleted: 0,
        }],
      },
      server_timestamp: "2026-11-19T10:05:00Z",
    });

    await pullChanges();

    expect(db.exec("SELECT status, type, payment_status, amount_paid, total_amount FROM purchase_orders WHERE id = 'po1'")[0].values).toEqual([
      ["closed", "immediate", "paid", 7000, 7000],
    ]);
  });
});
