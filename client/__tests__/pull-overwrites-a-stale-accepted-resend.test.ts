import { describe, it, expect, beforeAll, beforeEach, vi } from "vitest";
import initSqlJs, { type Database } from "sql.js";

vi.mock("idb-keyval", () => ({
  get: vi.fn(() => Promise.resolve(undefined)),
  set: vi.fn(() => Promise.resolve(undefined)),
}));

vi.mock("@/lib/api/client", () => ({
  apiClient: {
    pullChanges: vi.fn(),
  },
}));

// A-279, the client half of the contract.
// Rationale: docs/CLIENT_COMMENTS.md#block-__tests__-pull-overwrites-a-stale-accepted-resend-test-ts-L15
describe("pullChanges overwrites a stale row left by an accepted re-send", () => {
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
    db.run(`DELETE FROM _sync_state; DELETE FROM _sync_queue; DELETE FROM categories;`);
    vi.clearAllMocks();
  });

  const serverSendsWinningName = () =>
    apiClient.pullChanges.mockResolvedValueOnce({
      success: true,
      changes: {
        categories: [
          {
            id: "cat-1",
            name: "Antibiotics",
            _version: 9,
          },
        ],
      },
      server_timestamp: "2026-10-18T12:00:00Z",
    });

  it("applies the server's row once the accepted re-send has cleared the queue entry", async () => {
    db.run(
      `INSERT INTO categories (id, name, _synced, _version, _deleted)
       VALUES ('cat-1', 'Stale Local Name', 1, 9, 0)`,
    );

    serverSendsWinningName();

    await pullChanges();

    const rows = db.exec(`SELECT name FROM categories WHERE id = 'cat-1'`);
    expect(rows[0].values[0][0]).toBe("Antibiotics");
  });

  it("still leaves a row with a genuine pending local edit alone", async () => {
    db.run(
      `INSERT INTO categories (id, name, _synced, _version, _deleted)
       VALUES ('cat-1', 'Edited Here', 0, 9, 0)`,
    );
    db.run(
      `INSERT INTO _sync_queue (table_name, record_id, operation, payload, created_at)
       VALUES ('categories', 'cat-1', 'UPDATE', '{}', '2026-10-18T11:00:00.000Z')`,
    );

    serverSendsWinningName();

    await pullChanges();

    const rows = db.exec(`SELECT name FROM categories WHERE id = 'cat-1'`);
    expect(rows[0].values[0][0]).toBe("Edited Here");
  });
});
