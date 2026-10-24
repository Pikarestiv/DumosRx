import { describe, it, expect, beforeAll, beforeEach, vi } from "vitest";
import initSqlJs, { type Database } from "sql.js";

vi.mock("idb-keyval", () => ({
  get: vi.fn(() => Promise.resolve(undefined)),
  set: vi.fn(() => Promise.resolve(undefined)),
}));

const logCrash = vi.fn();
vi.mock("@/lib/utils/error-logger", async (importOriginal) => ({
  ...((await importOriginal()) as object),
  logCrash: (...args: unknown[]) => logCrash(...args),
}));

// A-218: both rewind call sites used to wipe the table's `_sync_state` row, which pullChanges reads as "pull this table fr…
// Rationale: docs/CLIENT_COMMENTS.md#block-__tests__-pull-window-rewind-budget-test-ts-L15
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
      `INSERT INTO _sync_state (store_id, table_name, last_synced_at) VALUES ('store-1', 'products', '2026-10-10T00:00:00Z')`,
    );
    logCrash.mockReset();
  });

  const windowFor = (table: string) =>
    db.exec(`SELECT last_synced_at FROM _sync_state WHERE store_id = 'store-1' AND table_name = '${table}'`)[0]
      ?.values[0][0] ?? null;

  it("rewinds the window on the first request", async () => {
    expect(await rewindPullWindow("store-1", "products", "version_conflict")).toBe(true);
    expect(windowFor("products")).toBeNull();
  });

  it("restores the pre-rewind baseline and reports once the budget is spent", async () => {
    for (let i = 0; i < MAX_PULL_WINDOW_REWINDS; i++) {
      expect(await rewindPullWindow("store-1", "products", "version_conflict")).toBe(true);
    }

    expect(await rewindPullWindow("store-1", "products", "version_conflict")).toBe(false);
    expect(windowFor("products")).toBe("2026-10-10T00:00:00Z");
    expect(logCrash).toHaveBeenCalledTimes(1);

    expect(await rewindPullWindow("store-1", "products", "version_conflict")).toBe(false);
    expect(windowFor("products")).toBe("2026-10-10T00:00:00Z");
  });

  it("restores an exhausted baseline on a later round even though the fault stopped firing", async () => {
    for (let i = 0; i < MAX_PULL_WINDOW_REWINDS; i++) {
      await rewindPullWindow("store-1", "products", "version_conflict");
    }
    expect(windowFor("products")).toBeNull();

    expect(await restoreExhaustedPullWindows("store-1")).toEqual(["products"]);

    expect(windowFor("products")).toBe("2026-10-10T00:00:00Z");
    expect(logCrash).toHaveBeenCalledTimes(1);
  });

  it("reports again every round while the table is still held at its budget", async () => {
    for (let i = 0; i < MAX_PULL_WINDOW_REWINDS; i++) {
      await rewindPullWindow("store-1", "products", "version_conflict");
    }

    await restoreExhaustedPullWindows("store-1");
    await restoreExhaustedPullWindows("store-1");

    expect(logCrash).toHaveBeenCalledTimes(2);
    expect(windowFor("products")).toBe("2026-10-10T00:00:00Z");
  });

  it("leaves a table inside its budget alone", async () => {
    await rewindPullWindow("store-1", "products", "version_conflict");

    expect(await restoreExhaustedPullWindows("store-1")).toEqual([]);

    expect(windowFor("products")).toBeNull();
    expect(logCrash).not.toHaveBeenCalled();
  });

  it("refreshes the budget once the table drains skip-free", async () => {
    for (let i = 0; i < MAX_PULL_WINDOW_REWINDS; i++) {
      await rewindPullWindow("store-1", "products", "version_conflict");
    }

    await core.execute(
      `INSERT INTO _sync_state (store_id, table_name, last_synced_at, server_cursor) VALUES ('store-1', 'products', '2026-10-11T00:00:00Z', NULL)
       ON CONFLICT(store_id, table_name) DO UPDATE SET last_synced_at = excluded.last_synced_at, server_cursor = NULL, rewind_count = 0, rewound_from = NULL`,
    );

    expect(await rewindPullWindow("store-1", "products", "version_conflict")).toBe(true);
    expect(windowFor("products")).toBeNull();
    expect(logCrash).not.toHaveBeenCalled();
  });

  // A-256. `feedback` is the crash log:
  // Rationale: docs/CLIENT_COMMENTS.md#block-__tests__-pull-window-rewind-budget-test-ts-L122
  it("drops an exhausted window for a table the server never sends, instead of reporting it for ever", async () => {
    await core.execute(
      `INSERT INTO _sync_state (store_id, table_name, last_synced_at, server_cursor, rewind_count, rewound_from)
       VALUES ('store-1', 'feedback', NULL, NULL, ?, '2026-10-10T00:00:00Z')`,
      [MAX_PULL_WINDOW_REWINDS],
    );

    expect(await restoreExhaustedPullWindows("store-1")).toEqual([]);

    const rows = db.exec("SELECT table_name FROM _sync_state WHERE table_name = 'feedback'");
    expect(rows[0]?.values ?? []).toEqual([]);
    expect(logCrash).not.toHaveBeenCalled();
  });

  // A-273. The report was fired unawaited, so one push round's worth of concurrent calls raced past logCrash's own SELECT-th…
  // Rationale: docs/CLIENT_COMMENTS.md#block-__tests__-pull-window-rewind-budget-test-ts-L143
  it("waits for the report to be written before returning", async () => {
    for (let i = 0; i < MAX_PULL_WINDOW_REWINDS; i++) {
      await rewindPullWindow("store-1", "products", "version_conflict");
    }

    let releaseReport!: () => void;
    logCrash.mockImplementation(
      () => new Promise<void>((resolve) => { releaseReport = resolve; }),
    );

    let returned = false;
    const restoring = restoreExhaustedPullWindows("store-1").then(() => { returned = true; });
    await new Promise((resolve) => setTimeout(resolve, 0));

    expect(returned).toBe(false);

    releaseReport();
    await restoring;
    expect(returned).toBe(true);
  });

  // A-273. The old wording ("this device cannot converge on its own") was false:
  // Rationale: docs/CLIENT_COMMENTS.md#block-__tests__-pull-window-rewind-budget-test-ts-L170
  it("reports what is actually true of the device", async () => {
    for (let i = 0; i < MAX_PULL_WINDOW_REWINDS; i++) {
      await rewindPullWindow("store-1", "products", "version_conflict");
    }

    await restoreExhaustedPullWindows("store-1");

    const message = (logCrash.mock.calls[0][0] as Error).message;
    expect(message).not.toContain("cannot converge");
    expect(message).toContain("products");
    expect(message).toContain("incremental pull continues");
  });

  /** The per-round reporting A-229 pinned must be untouched: a table still
   * held at its budget keeps saying so. */
  it("still reports an exhausted business table every round", async () => {
    for (let i = 0; i < MAX_PULL_WINDOW_REWINDS; i++) {
      await rewindPullWindow("store-1", "products", "version_conflict");
    }

    expect(await restoreExhaustedPullWindows("store-1")).toEqual(["products"]);
    expect(await restoreExhaustedPullWindows("store-1")).toEqual(["products"]);
    expect(logCrash).toHaveBeenCalledTimes(2);
  });
});
