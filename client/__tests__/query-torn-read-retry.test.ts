import { describe, it, expect, beforeAll, beforeEach, vi } from "vitest";
import initSqlJs, { type Database } from "sql.js";

vi.mock("idb-keyval", () => ({
  get: vi.fn(async () => undefined),
  set: vi.fn(async () => undefined),
}));

/**
 * Regression coverage for the Product Catalog's "No products found" flash
 * during a large sync (see docs/KNOWN_BUGS.md).
 *
 * query() yields a tick back to the browser every QUERY_YIELD_INTERVAL rows
 * so a big result set doesn't block painting. sql.js has one shared
 * connection with no reader isolation, so a write landing during one of
 * those yields modifies the very table the live statement is stepping
 * through — SQLite's behavior there is undefined, and the observed outcome
 * was a silently short (in the worst case empty) result with no error
 * raised. query() now re-runs the read instead of returning it.
 *
 * Only queries big enough to reach a yield point are exposed to this, which
 * is why the ~1900-row catalog query flashed empty while the single-row
 * "Total Products" aggregates stayed correct in the same window.
 */
describe("query() vs. a write interleaved into its row-fetch yield", () => {
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
    core.__setDatabaseForTesting(db);
  });

  beforeEach(() => {
    db.run("DELETE FROM products");
  });

  // Comfortably past QUERY_YIELD_INTERVAL (200) so the read is guaranteed to
  // suspend at least once mid-statement.
  const ROW_COUNT = 450;

  const seedProducts = () => {
    for (let i = 0; i < ROW_COUNT; i++) {
      db.run("INSERT INTO products (id, name, _deleted) VALUES (?, ?, 0)", [
        `p${i}`,
        `PRODUCT ${i}`,
      ]);
    }
  };

  // Counting prepare() calls is how the re-run is observed: the torn result
  // this guards against is nondeterministic SQLite-internal behavior that
  // can't be forced on demand from a test, but "the read was issued again
  // because a write interleaved" is exactly the guarantee being added, and
  // it is directly observable.
  const countPreparesDuring = async (fn: () => Promise<unknown>) => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const realPrepare = (db as any).prepare.bind(db);
    let prepares = 0;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (db as any).prepare = (...args: unknown[]) => {
      // sql.js's own db.run(sql, params) prepares a statement too, so only
      // count preparations of the SELECT under test.
      if (typeof args[0] === "string" && args[0].startsWith("SELECT id FROM products")) {
        prepares++;
      }
      return realPrepare(...args);
    };
    try {
      const result = await fn();
      return { prepares, result };
    } finally {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (db as any).prepare = realPrepare;
    }
  };

  it("re-runs the read when a write lands mid-statement", async () => {
    seedProducts();

    const { prepares, result } = await countPreparesDuring(async () => {
      const reading = core.query<{ id: string }>(
        "SELECT id FROM products WHERE _deleted = 0 ORDER BY id",
      );

      // Land a write while the read above is suspended at a yield point.
      // This is the shape of a sync apply draining its backlog underneath
      // an open catalog query.
      await new Promise((r) => setTimeout(r, 0));
      await core.execute("UPDATE products SET _deleted = 1 WHERE id = ?", ["p0"]);

      return reading;
    });

    expect(prepares).toBeGreaterThan(1);

    const rows = result as { id: string }[];
    expect(rows).toHaveLength(ROW_COUNT - 1);
    expect(rows.some((r) => r.id === "p0")).toBe(false);
  });

  it("never reports an open transaction's uncommitted intermediate state", async () => {
    seedProducts();

    let releaseApply: () => void;
    const gate = new Promise<void>((resolve) => {
      releaseApply = resolve;
    });

    // Stands in for a large sync apply: it empties the table, pauses
    // mid-transaction, then fails and rolls back. Nothing outside the
    // transaction may ever see that empty intermediate state — which is
    // exactly the false "No products found" the Catalog page showed.
    const apply = core
      .transaction(async () => {
        await core.execute("UPDATE products SET _deleted = 1");
        await gate;
        throw new Error("apply failed");
      })
      .catch(() => {});

    const reading = core.query<{ id: string }>(
      "SELECT id FROM products WHERE _deleted = 0 ORDER BY id",
    );

    // Let the read start, hit the transaction's writes, and retry.
    await new Promise((r) => setTimeout(r, 0));
    await new Promise((r) => setTimeout(r, 0));
    releaseApply!();
    await apply;

    expect(await reading).toHaveLength(ROW_COUNT);
  });

  it("does not re-run a read that nothing wrote underneath", async () => {
    seedProducts();

    const { prepares, result } = await countPreparesDuring(() =>
      core.query<{ id: string }>(
        "SELECT id FROM products WHERE _deleted = 0 ORDER BY id",
      ),
    );

    expect(prepares).toBe(1);
    expect(result as { id: string }[]).toHaveLength(ROW_COUNT);
  });
});
