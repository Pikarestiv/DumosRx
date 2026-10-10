import { describe, it, expect, beforeAll, beforeEach, vi } from "vitest";
import initSqlJs, { type Database } from "sql.js";

vi.mock("idb-keyval", () => ({
  get: vi.fn(async () => undefined),
  set: vi.fn(async () => undefined),
}));

vi.mock("@/lib/api/client", () => ({
  apiClient: {
    pullChanges: vi.fn(),
  },
}));

/**
 * A-197: a delta deferred because its batch hadn't arrived yet was applied
 * only after the whole page loop, so a later page's movements for the same
 * batch ran first and were clamped away by the per-movement MAX(0, …) floor.
 * The differential oracle is the server's own derivation: replay the
 * movements in server order, flooring after each one.
 */
describe("pullChanges: deferred deltas apply ahead of a later page's own movements", () => {
  let db: Database;
  let core: typeof import("@/lib/db/core");
  let pullChanges: typeof import("@/lib/db/sync-engine/pull").pullChanges;
  let apiClient: { pullChanges: ReturnType<typeof vi.fn> };

  beforeAll(async () => {
    core = await import("@/lib/db/core");
    ({ pullChanges } = await import("@/lib/db/sync-engine/pull"));
    ({ apiClient } = (await import("@/lib/api/client")) as unknown as {
      apiClient: { pullChanges: ReturnType<typeof vi.fn> };
    });

    const { SCHEMA_SQL } = await import("@/lib/db/schema");
    const SQL = await initSqlJs({
      locateFile: () => require.resolve("sql.js/dist/sql-wasm.wasm"),
    });
    db = new SQL.Database();
    db.run(SCHEMA_SQL);
    core.__setDatabaseForTesting(db);
  });

  beforeEach(() => {
    db.run(
      `DELETE FROM _sync_state; DELETE FROM _sync_queue; DELETE FROM _pending_stock_deltas;
       DELETE FROM stock_batches; DELETE FROM stock_movements; DELETE FROM products;`,
    );
    db.run(
      `INSERT INTO products (id, name, _deleted) VALUES ('prod-1', 'Pentazocine Inj', 0)`,
    );
    db.run(
      `INSERT INTO _sync_state (table_name, last_synced_at) VALUES
         ('stock_batches', '2026-08-15T00:00:00Z'),
         ('stock_movements', '2026-08-15T00:00:00Z')`,
    );
    vi.clearAllMocks();
  });

  const batchRow = (id: string, updatedAt: string) => ({
    id,
    product_id: "prod-1",
    store_id: "store-1",
    quantity: 999,
    is_active: 1,
    updated_at: updatedAt,
    _version: 1,
  });

  const movementRow = (
    id: string,
    batchId: string,
    quantity: number,
    updatedAt: string,
  ) => ({
    id,
    stock_batch_id: batchId,
    product_id: "prod-1",
    store_id: "store-1",
    quantity,
    movement_type: quantity > 0 ? "purchase" : "sale",
    updated_at: updatedAt,
    _version: 1,
  });

  const localQuantity = (batchId: string): number => {
    const rows = db.exec(`SELECT quantity FROM stock_batches WHERE id = '${batchId}'`);
    return Number(rows[0]?.values?.[0]?.[0] ?? -1);
  };

  /** The server's derivation: floor applied after every movement. */
  const serverQuantity = (deltas: number[]): number =>
    deltas.reduce((running, delta) => Math.max(0, running + delta), 0);

  it("replays the real Pentazocine case to the server's value, not the opening receipt", async () => {
    apiClient.pullChanges
      .mockResolvedValueOnce({
        success: true,
        changes: {
          stock_movements: [movementRow("mv-1", "batch-1", 80, "2026-09-01T00:00:00Z")],
        },
        server_timestamp: "2026-09-01T00:00:01Z",
        has_more: { stock_movements: true, stock_batches: true },
      })
      .mockResolvedValueOnce({
        success: true,
        changes: {
          stock_batches: [batchRow("batch-1", "2026-09-02T00:00:00Z")],
          stock_movements: [movementRow("mv-2", "batch-1", -28, "2026-09-02T00:00:00Z")],
        },
        server_timestamp: "2026-09-02T00:00:01Z",
        has_more: { stock_movements: false, stock_batches: false },
      });

    await pullChanges();

    expect(localQuantity("batch-1")).toBe(serverQuantity([80, -28]));
    expect(localQuantity("batch-1")).toBe(52);
  });

  it("agrees with the server's derivation across randomised page splits", async () => {
    let seed = 20261010;
    const random = () => {
      seed = (seed * 1103515245 + 12345) & 0x7fffffff;
      return seed / 0x7fffffff;
    };
    const pick = <T>(items: T[]): T => items[Math.floor(random() * items.length)];

    const failures: string[] = [];

    for (let caseIndex = 0; caseIndex < 60; caseIndex++) {
      db.run(
        `DELETE FROM _pending_stock_deltas; DELETE FROM stock_batches;
         DELETE FROM stock_movements; DELETE FROM _sync_state;`,
      );
      db.run(
        `INSERT INTO _sync_state (table_name, last_synced_at) VALUES
           ('stock_batches', '2026-08-15T00:00:00Z'),
           ('stock_movements', '2026-08-15T00:00:00Z')`,
      );
      vi.clearAllMocks();

      const batchId = `batch-${caseIndex}`;
      // An opening receipt then a random run of sales and top-ups, which is
      // the shape that exposes the floor's non-commutativity.
      const deltas = [10 + Math.floor(random() * 90)];
      const movementCount = 2 + Math.floor(random() * 5);
      for (let i = 1; i < movementCount; i++) {
        deltas.push(pick([-1, -3, -7, -25, 5, 12]));
      }

      // Every movement on its own page, with the batch landing on a random
      // page — before, with, or after the movements that depend on it.
      const batchPage = Math.floor(random() * deltas.length);
      for (let i = 0; i < deltas.length; i++) {
        const last = i === deltas.length - 1;
        apiClient.pullChanges.mockResolvedValueOnce({
          success: true,
          changes: {
            ...(i === batchPage
              ? { stock_batches: [batchRow(batchId, `2026-09-0${i + 1}T00:00:00Z`)] }
              : {}),
            stock_movements: [
              movementRow(
                `mv-${caseIndex}-${i}`,
                batchId,
                deltas[i],
                `2026-09-0${i + 1}T00:00:00Z`,
              ),
            ],
          },
          server_timestamp: `2026-09-0${i + 1}T00:00:01Z`,
          has_more: { stock_movements: !last, stock_batches: !last },
        });
      }

      await pullChanges();

      const expected = serverQuantity(deltas);
      const actual = localQuantity(batchId);
      if (actual !== expected) {
        failures.push(
          `case ${caseIndex}: batch on page ${batchPage}, deltas ${deltas.join(",")} → local ${actual}, server ${expected}`,
        );
      }
    }

    expect(failures).toEqual([]);
  });
});
