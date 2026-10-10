import { describe, it, expect, beforeAll, beforeEach, vi } from "vitest";
import initSqlJs, { type Database } from "sql.js";

vi.mock("idb-keyval", () => ({
  get: vi.fn(async () => undefined),
  set: vi.fn(async () => undefined),
}));

const logCrash = vi.fn();
vi.mock("@/lib/utils/error-logger", async (importOriginal) => ({
  ...((await importOriginal()) as object),
  logCrash: (...args: unknown[]) => logCrash(...args),
}));

/**
 * A-218: both rewind call sites used to wipe the table's `_sync_state` row,
 * which pullChanges reads as "pull this table from timestamp zero". A table
 * held in `skippedTables` by a parked `_sync_queue` row can never re-stamp
 * the window, so the baseline was gone and every later round re-requested
 * the whole catalogue, for ever.
 */
describe("pull window rewind budget", () => {
  let db: Database;
  let core: typeof import("@/lib/db/core");
  let rewindPullWindow: typeof import("@/lib/db/sync-engine/pull-window").rewindPullWindow;
  let restoreExhaustedPullWindows: typeof import("@/lib/db/sync-engine/pull-window").restoreExhaustedPullWindows;
  let MAX_PULL_WINDOW_REWINDS: number;

  beforeAll(async () => {
    core = await import("@/lib/db/core");
    ({ rewindPullWindow, restoreExhaustedPullWindows, MAX_PULL_WINDOW_REWINDS } = await import(
      "@/lib/db/sync-engine/pull-window"
    ));

    const { SCHEMA_SQL } = await import("@/lib/db/schema");
    const SQL = await initSqlJs({
      locateFile: () => require.resolve("sql.js/dist/sql-wasm.wasm"),
    });
    db = new SQL.Database();
    db.run(SCHEMA_SQL);
    core.__setDatabaseForTesting(db);
  });

  beforeEach(() => {
    db.run(`DELETE FROM _sync_state`);
    db.run(
      `INSERT INTO _sync_state (table_name, last_synced_at) VALUES ('products', '2026-10-10T00:00:00Z')`,
    );
    logCrash.mockClear();
  });

  const windowFor = (table: string) =>
    db.exec(`SELECT last_synced_at FROM _sync_state WHERE table_name = '${table}'`)[0]
      ?.values[0][0] ?? null;

  it("rewinds the window on the first request", async () => {
    expect(await rewindPullWindow("products", "version_conflict")).toBe(true);
    expect(windowFor("products")).toBeNull();
  });

  it("restores the pre-rewind baseline and reports once the budget is spent", async () => {
    for (let i = 0; i < MAX_PULL_WINDOW_REWINDS; i++) {
      expect(await rewindPullWindow("products", "version_conflict")).toBe(true);
    }

    expect(await rewindPullWindow("products", "version_conflict")).toBe(false);
    expect(windowFor("products")).toBe("2026-10-10T00:00:00Z");
    expect(logCrash).toHaveBeenCalledTimes(1);

    expect(await rewindPullWindow("products", "version_conflict")).toBe(false);
    expect(windowFor("products")).toBe("2026-10-10T00:00:00Z");
  });

  it("restores an exhausted baseline on a later round even though the fault stopped firing", async () => {
    for (let i = 0; i < MAX_PULL_WINDOW_REWINDS; i++) {
      await rewindPullWindow("products", "version_conflict");
    }
    expect(windowFor("products")).toBeNull();

    expect(await restoreExhaustedPullWindows()).toEqual(["products"]);

    expect(windowFor("products")).toBe("2026-10-10T00:00:00Z");
    expect(logCrash).toHaveBeenCalledTimes(1);
  });

  it("reports again every round while the device still cannot converge", async () => {
    for (let i = 0; i < MAX_PULL_WINDOW_REWINDS; i++) {
      await rewindPullWindow("products", "version_conflict");
    }

    await restoreExhaustedPullWindows();
    await restoreExhaustedPullWindows();

    expect(logCrash).toHaveBeenCalledTimes(2);
    expect(windowFor("products")).toBe("2026-10-10T00:00:00Z");
  });

  it("leaves a table inside its budget alone", async () => {
    await rewindPullWindow("products", "version_conflict");

    expect(await restoreExhaustedPullWindows()).toEqual([]);

    expect(windowFor("products")).toBeNull();
    expect(logCrash).not.toHaveBeenCalled();
  });

  it("refreshes the budget once the table drains skip-free", async () => {
    for (let i = 0; i < MAX_PULL_WINDOW_REWINDS; i++) {
      await rewindPullWindow("products", "version_conflict");
    }

    await core.execute(
      `INSERT INTO _sync_state (table_name, last_synced_at, server_cursor) VALUES ('products', '2026-10-11T00:00:00Z', NULL)
       ON CONFLICT(table_name) DO UPDATE SET last_synced_at = excluded.last_synced_at, server_cursor = NULL, rewind_count = 0, rewound_from = NULL`,
    );

    expect(await rewindPullWindow("products", "version_conflict")).toBe(true);
    expect(windowFor("products")).toBeNull();
    expect(logCrash).not.toHaveBeenCalled();
  });
});
