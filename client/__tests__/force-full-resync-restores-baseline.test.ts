import { describe, it, expect, beforeAll, beforeEach, vi } from "vitest";
import initSqlJs, { type Database } from "sql.js";

vi.mock("idb-keyval", () => ({
  get: vi.fn(async () => undefined),
  set: vi.fn(async () => undefined),
}));

/**
 * A-243. `forceFullResync()` deleted `_sync_state` and then pulled. The pull
 * only persists progress inside a committed page transaction, so a resync
 * whose first page never lands (A-206 throws on the fetch) left the device
 * with no window and no cursor at all — every later sync then a full pull
 * failing the same way. One till was stranded exactly that way in production
 * on 2026-10-12, and this function is the health check's only recovery action.
 *
 * The stash lives in pull-window.ts because that module already owns every
 * write to `_sync_state` outside pull.ts's own progress upserts.
 */
describe("clearPullWindows / restorePullWindows", () => {
  let db: Database;
  let core: typeof import("@/lib/db/core");
  let mod: typeof import("@/lib/db/sync-engine/pull-window");

  beforeAll(async () => {
    core = await import("@/lib/db/core");
    const { SCHEMA_SQL } = await import("@/lib/db/schema");
    const SQL = await initSqlJs({
      locateFile: () => require.resolve("sql.js/dist/sql-wasm.wasm"),
    });
    db = new SQL.Database();
    db.run(SCHEMA_SQL);
    core.__setDatabaseForTesting(db);
    mod = await import("@/lib/db/sync-engine/pull-window");
  });

  beforeEach(() => {
    db.run("DELETE FROM _sync_state");
  });

  const seed = () =>
    db.run(
      `INSERT INTO _sync_state (table_name, last_synced_at, server_cursor, rewind_count, rewound_from)
       VALUES ('products', '2026-10-12T11:00:00Z', NULL, 3, '2026-10-11T09:00:00Z'),
              ('stock_movements', '2026-10-12T11:00:00Z', '{"updated_at":"x","id":"y"}', 0, NULL)`,
    );

  const rows = () =>
    db.exec(
      "SELECT table_name, last_synced_at, server_cursor, rewind_count FROM _sync_state ORDER BY table_name",
    )[0]?.values ?? [];

  it("clears every window and hands back what it removed", async () => {
    seed();

    const stashed = await mod.clearPullWindows();

    expect(rows()).toEqual([]);
    expect(stashed).toHaveLength(2);
  });

  it("puts the windows back when the resync committed nothing", async () => {
    seed();
    const stashed = await mod.clearPullWindows();

    expect(await mod.restorePullWindows(stashed)).toBe(true);
    expect(rows()).toEqual([
      ["products", "2026-10-12T11:00:00Z", null, 3],
      ["stock_movements", "2026-10-12T11:00:00Z", '{"updated_at":"x","id":"y"}', 0],
    ]);
  });

  it("leaves a resync that did commit a page alone", async () => {
    seed();
    const stashed = await mod.clearPullWindows();
    db.run(
      `INSERT INTO _sync_state (table_name, last_synced_at) VALUES ('products', '2026-10-12T12:00:00Z')`,
    );

    expect(await mod.restorePullWindows(stashed)).toBe(false);
    expect(rows()).toEqual([["products", "2026-10-12T12:00:00Z", null, 0]]);
  });

  /** A device with no windows to begin with has nothing to protect, and a
   * restore of nothing must not resurrect an empty row. */
  it("does nothing when there was no baseline", async () => {
    const stashed = await mod.clearPullWindows();

    expect(await mod.restorePullWindows(stashed)).toBe(false);
    expect(rows()).toEqual([]);
  });
});
