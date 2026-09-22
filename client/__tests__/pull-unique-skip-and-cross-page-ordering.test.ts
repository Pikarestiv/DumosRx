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
 * Regression tests for two confirmed-live gaps documented in
 * docs/KNOWN_BUGS.md under "sync-engine/pull.ts stock-quantity correctness
 * gaps":
 *
 * 1. A UNIQUE-constraint-skipped INSERT was still marked "seen" for cursor
 *    purposes, so it was never retried.
 * 2. Cross-page "batches before movements" ordering wasn't guaranteed — a
 *    movement could be pulled on an earlier page than the batch it
 *    references, silently losing the delta.
 */
describe("pullChanges: UNIQUE-constraint skip and cross-page batch/movement ordering", () => {
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
      `DELETE FROM _sync_state; DELETE FROM _sync_queue; DELETE FROM stock_batches; DELETE FROM stock_movements; DELETE FROM products; DELETE FROM users;`,
    );
    db.run(
      `INSERT INTO products (id, name, _deleted) VALUES ('prod-1', 'Test Widget', 0)`,
    );
    vi.clearAllMocks();
  });

  it("does not advance the table cursor when an INSERT is skipped on a UNIQUE constraint violation", async () => {
    db.run(
      `INSERT INTO _sync_state (table_name, last_synced_at) VALUES ('users', '2026-08-15T00:00:00Z')`,
    );
    // A local user already occupies the email a distinct incoming server
    // row will collide with (users.email is UNIQUE).
    db.run(
      `INSERT INTO users (id, email, role, _deleted, _version) VALUES ('user-local', 'dup@example.com', 'staff', 0, 1)`,
    );

    apiClient.pullChanges.mockResolvedValueOnce({
      success: true,
      changes: {
        users: [
          {
            id: "user-server",
            email: "dup@example.com",
            role: "staff",
            updated_at: "2026-09-01T00:00:00Z",
            _version: 1,
          },
        ],
      },
      server_timestamp: "2026-09-01T00:00:01Z",
      has_more: { users: false },
    });

    await pullChanges();

    // The insert must have hit the UNIQUE constraint on email and been
    // skipped — the server row was never inserted locally.
    const rows = db.exec(`SELECT id FROM users WHERE id = 'user-server'`);
    expect(rows.length).toBe(0);

    // The cursor must stay at its original value, not advance to
    // server_timestamp, since the skipped row must be retried later.
    const cursor = db.exec(
      `SELECT last_synced_at FROM _sync_state WHERE table_name = 'users'`,
    );
    expect(cursor[0].values[0][0]).toBe("2026-08-15T00:00:00Z");
  });

  it("applies a movement's delta to a batch that only arrives on a later page (deferred until every page is pulled)", async () => {
    apiClient.pullChanges
      .mockResolvedValueOnce({
        success: true,
        changes: {
          // Movement pulled first, referencing a batch not yet inserted
          // locally — it won't arrive until the next page below.
          stock_movements: [
            {
              id: "move-1",
              product_id: "prod-1",
              stock_batch_id: "batch-cross-page",
              movement_type: "purchase",
              quantity: 15,
              _version: 1,
            },
          ],
        },
        server_timestamp: "2026-09-19T00:00:01Z",
        has_more: { stock_movements: false, stock_batches: true },
      })
      .mockResolvedValueOnce({
        success: true,
        changes: {
          stock_batches: [
            {
              id: "batch-cross-page",
              product_id: "prod-1",
              batch_number: "Opening Stock",
              quantity: 0,
              is_active: true,
              _version: 1,
            },
          ],
        },
        server_timestamp: "2026-09-19T00:00:02Z",
        has_more: { stock_batches: false },
      });

    await pullChanges();

    const batchRows = db.exec(
      `SELECT quantity FROM stock_batches WHERE id = 'batch-cross-page'`,
    );
    expect(batchRows[0].values[0][0]).toBe(15);

    // The stock_movements cursor is held back until the deferred delta is
    // applied, then stamped in that same transaction — so by the end of a
    // successful pull it must be stamped, not left behind.
    const cursor = db.exec(
      `SELECT last_synced_at FROM _sync_state WHERE table_name = 'stock_movements'`,
    );
    expect(cursor[0].values[0][0]).toBe("2026-09-19T00:00:01Z");
  });

  /**
   * Residual gap from the same KNOWN_BUGS entry: the deferred delta used to
   * be applied in a SEPARATE transaction committed AFTER the page loop had
   * already committed stock_movements' cursor. A crash in that window lost
   * the delta permanently (a movement's insert branch only ever runs once,
   * so a re-pull past the advanced cursor never re-derives it).
   *
   * Here the deferred delta's UPDATE is forced to fail (via a RAISE(ABORT)
   * trigger) to stand in for that crash. With the old two-transaction
   * structure the cursor stamp from page 1 would already be committed and
   * would survive; now the stamp lives in the same transaction as the
   * deltas, so the failure must roll BOTH back, leaving the cursor unset and
   * the movements eligible for a clean re-pull.
   */
  it("rolls the stock_movements cursor back together with a failed deferred delta (no crash window between them)", async () => {
    db.run(
      `CREATE TRIGGER fail_deferred_delta BEFORE UPDATE OF quantity ON stock_batches
       BEGIN SELECT RAISE(ABORT, 'injected failure between cursor commit and deferred delta'); END;`,
    );

    try {
      apiClient.pullChanges
        .mockResolvedValueOnce({
          success: true,
          changes: {
            stock_movements: [
              {
                id: "move-atomic",
                product_id: "prod-1",
                stock_batch_id: "batch-atomic",
                movement_type: "purchase",
                quantity: 7,
                _version: 1,
              },
            ],
          },
          server_timestamp: "2026-09-20T00:00:01Z",
          has_more: { stock_movements: false, stock_batches: true },
        })
        .mockResolvedValueOnce({
          success: true,
          changes: {
            stock_batches: [
              {
                id: "batch-atomic",
                product_id: "prod-1",
                batch_number: "Opening Stock",
                quantity: 0,
                is_active: true,
                _version: 1,
              },
            ],
          },
          server_timestamp: "2026-09-20T00:00:02Z",
          has_more: { stock_batches: false },
        });

      await expect(pullChanges()).rejects.toThrow();

      // The cursor must NOT be stamped: it was committed atomically with the
      // delta that failed, so both rolled back.
      const cursor = db.exec(
        `SELECT last_synced_at FROM _sync_state WHERE table_name = 'stock_movements'`,
      );
      expect(cursor.length).toBe(0);

      // The delta itself is of course not applied either.
      const batchRows = db.exec(
        `SELECT quantity FROM stock_batches WHERE id = 'batch-atomic'`,
      );
      expect(batchRows[0].values[0][0]).toBe(0);
    } finally {
      db.run(`DROP TRIGGER fail_deferred_delta`);
    }
  });
});
