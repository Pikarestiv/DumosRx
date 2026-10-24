import { describe, it, expect, beforeAll, beforeEach, vi } from "vitest";
import initSqlJs, { type Database } from "sql.js";

vi.mock("idb-keyval", () => ({
  get: vi.fn(() => Promise.resolve(undefined)),
  set: vi.fn(() => Promise.resolve(undefined)),
}));

// Stage 1 of docs/superpowers/specs/2026-10-14-oversell-compensating-movement-design.md:
// Rationale: docs/CLIENT_COMMENTS.md#block-__tests__-batch-deficits-test-ts-L9
const STORE_ID = "store-1";
const OTHER_STORE = "store-2";

describe("getBatchDeficits", () => {
  let db: Database;
  let core: typeof import("@/lib/db/core");
  let getBatchDeficits: typeof import("@/lib/db/batch-quantity").getBatchDeficits;
  let getOversoldAlerts: typeof import("@/lib/db/queries/inventory").getOversoldAlerts;

  beforeAll(async () => {
    core = await import("@/lib/db/core");
    ({ getBatchDeficits } = await import("@/lib/db/batch-quantity"));
    ({ getOversoldAlerts } = await import("@/lib/db/queries/inventory"));

    const { SCHEMA_SQL } = await import("@/lib/db/schema");
    const SQL = await initSqlJs({
      locateFile: () => require.resolve("sql.js/dist/sql-wasm.wasm"),
    });
    db = new SQL.Database();
    db.run(SCHEMA_SQL);
    db.run(`ALTER TABLE stock_batches ADD COLUMN store_id TEXT`);
    db.run(`ALTER TABLE products ADD COLUMN store_id TEXT`);
    db.run(`ALTER TABLE stock_movements ADD COLUMN store_id TEXT`);
    core.__setDatabaseForTesting(db);
    core.setActiveStoreId(STORE_ID);
  });

  beforeEach(() => {
    db.run(
      `DELETE FROM stock_movements; DELETE FROM stock_batches; DELETE FROM products;
       DELETE FROM _sync_state;`,
    );
    // A device whose movement window is fully drained; the alert is gated on it.
    db.run(
      `INSERT INTO _sync_state (store_id, table_name, last_synced_at) VALUES ('store-1', 'stock_movements', '2026-09-26T10:00:00Z')`,
    );
  });

  function product(id: string, name: string, storeId = STORE_ID) {
    db.run(
      `INSERT INTO products (id, name, _deleted, store_id)
       VALUES ('${id}', '${name}', 0, '${storeId}')`,
    );
  }

  function batch(id: string, productId: string, quantity: number, isActive = 1) {
    db.run(
      `INSERT INTO stock_batches (id, product_id, batch_number, quantity, is_active, _deleted, store_id)
       VALUES ('${id}', '${productId}', 'Opening Stock', ${quantity}, ${isActive}, 0, '${STORE_ID}')`,
    );
  }

  function movement(
    id: string,
    batchId: string,
    productId: string,
    quantity: number,
    movementDate = "2026-09-25T10:00:00Z",
    deleted = 0,
  ) {
    db.run(
      `INSERT INTO stock_movements
         (id, product_id, stock_batch_id, movement_type, quantity, movement_date, _deleted, store_id)
       VALUES ('${id}', '${productId}', '${batchId}', '${quantity > 0 ? "purchase" : "sale"}',
               ${quantity}, '${movementDate}', ${deleted}, '${STORE_ID}')`,
    );
  }

  /** The live production case: 4 units in, 6 out, stored 0. */
  function seedGluformin() {
    product("p1", "gluformin");
    batch("b1", "p1", 0);
    movement("m1", "b1", "p1", 4);
    movement("m2", "b1", "p1", -6, "2026-09-26T10:00:00Z");
  }

  it("reports the shortfall on a batch whose log sums below zero", async () => {
    seedGluformin();

    const deficits = await getBatchDeficits();

    expect(deficits).toEqual([
      {
        batchId: "b1",
        productId: "p1",
        productName: "gluformin",
        deficit: 2,
        lastMovementDate: "2026-09-26T10:00:00Z",
      },
    ]);
  });

  it("reports nothing for a batch whose log balances or is in credit", async () => {
    product("p1", "amoxicillin");
    batch("b1", "p1", 10);
    movement("m1", "b1", "p1", 10);
    batch("b2", "p1", 0);
    movement("m2", "b2", "p1", 5);
    movement("m3", "b2", "p1", -5);

    expect(await getBatchDeficits()).toEqual([]);
  });

  it("finds a deficit however old it is, which the reason-matching alert could not (A-212)", async () => {
    product("p1", "gluformin");
    batch("b1", "p1", 0);
    movement("m1", "b1", "p1", 4, "2025-01-01T10:00:00Z");
    movement("m2", "b1", "p1", -6, "2025-01-02T10:00:00Z");

    const deficits = await getBatchDeficits();

    expect(deficits).toHaveLength(1);
    expect(deficits[0].deficit).toBe(2);
  });

  it("does not depend on a movement's reason text", async () => {
    seedGluformin();
    db.run(`UPDATE stock_movements SET reason = 'Customer sale' WHERE id = 'm2'`);

    expect(await getBatchDeficits()).toHaveLength(1);
  });

  it("ignores a soft-deleted movement", async () => {
    product("p1", "gluformin");
    batch("b1", "p1", 0);
    movement("m1", "b1", "p1", 4);
    movement("m2", "b1", "p1", -6, "2026-09-26T10:00:00Z", 1);

    expect(await getBatchDeficits()).toEqual([]);
  });

  it("ignores a deactivated batch", async () => {
    product("p1", "gluformin");
    batch("b1", "p1", 0, 0);
    movement("m1", "b1", "p1", 4);
    movement("m2", "b1", "p1", -6);

    expect(await getBatchDeficits()).toEqual([]);
  });

  it("is scoped to the active store", async () => {
    product("p1", "gluformin", OTHER_STORE);
    batch("b1", "p1", 0);
    movement("m1", "b1", "p1", 4);
    movement("m2", "b1", "p1", -6);

    expect(await getBatchDeficits()).toEqual([]);
  });

  it("reports one row per deficit batch, largest first", async () => {
    product("p1", "gluformin");
    batch("b1", "p1", 0);
    movement("m1", "b1", "p1", -2);
    batch("b2", "p1", 0);
    movement("m2", "b2", "p1", -9);

    const deficits = await getBatchDeficits();

    expect(deficits.map((d) => [d.batchId, d.deficit])).toEqual([
      ["b2", 9],
      ["b1", 2],
    ]);
  });

  describe("getOversoldAlerts, now derived from the deficits", () => {
    it("keeps the shape its two consumers read", async () => {
      seedGluformin();

      const alerts = await getOversoldAlerts();

      expect(alerts).toEqual([
        { product: "gluformin", quantity: 2, movementDate: "2026-09-26T10:00:00Z" },
      ]);
    });

    it("sums a product's deficits across its batches", async () => {
      product("p1", "gluformin");
      batch("b1", "p1", 0);
      movement("m1", "b1", "p1", -2);
      batch("b2", "p1", 0);
      movement("m2", "b2", "p1", -3);

      const alerts = await getOversoldAlerts();

      expect(alerts).toEqual([
        { product: "gluformin", quantity: 5, movementDate: "2026-09-25T10:00:00Z" },
      ]);
    });

    it("stays silent while this device is still catching up on movements", async () => {
      seedGluformin();
      db.run(
        `UPDATE _sync_state SET server_cursor = '{"id":"m2"}' WHERE store_id = 'store-1' AND table_name = 'stock_movements'`,
      );

      expect(await getOversoldAlerts()).toEqual([]);
      // The deficit itself is still measurable; only the alert is withheld.
      expect(await getBatchDeficits()).toHaveLength(1);

      db.run(
        `UPDATE _sync_state SET server_cursor = NULL WHERE store_id = 'store-1' AND table_name = 'stock_movements'`,
      );

      expect(await getOversoldAlerts()).toHaveLength(1);
    });

    it("reports nothing when no batch is short", async () => {
      product("p1", "amoxicillin");
      batch("b1", "p1", 10);
      movement("m1", "b1", "p1", 10);

      expect(await getOversoldAlerts()).toEqual([]);
    });
  });
});
