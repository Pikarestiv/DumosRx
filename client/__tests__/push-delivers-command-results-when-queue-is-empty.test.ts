import { describe, it, expect, beforeAll, beforeEach, vi } from "vitest";
import initSqlJs, { type Database } from "sql.js";

vi.mock("idb-keyval", () => ({
  get: vi.fn(async () => undefined),
  set: vi.fn(async () => undefined),
}));

vi.mock("@/lib/api/client", () => ({
  apiClient: {
    pushChanges: vi.fn(),
  },
}));

/**
 * Command outcomes rode along with queued changes, so a push happened only
 * when there was something queued. But the commonest successful outcome
 * EMPTIES the queue — abandoning or retrying the last stuck row — which left
 * the outcome with nothing to travel on and the operator looking at a command
 * that is forever "queued". An idle device could not pick a command up at
 * all, for the same reason.
 */
describe("pushChanges with an empty queue but a pending command outcome", () => {
  let db: Database;
  let core: typeof import("@/lib/db/core");
  let pushChanges: typeof import("@/lib/db/sync-engine/push").pushChanges;
  let apiClient: { pushChanges: ReturnType<typeof vi.fn> };

  beforeAll(async () => {
    core = await import("@/lib/db/core");
    ({ pushChanges } = await import("@/lib/db/sync-engine/push"));
    ({ apiClient } = (await import("@/lib/api/client")) as unknown as {
      apiClient: { pushChanges: ReturnType<typeof vi.fn> };
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
    db.run(`DELETE FROM _sync_queue; DELETE FROM _pending_command_results;`);
    vi.clearAllMocks();
    apiClient.pushChanges.mockResolvedValue({ success: true, failed: [] });
  });

  const recordOutcome = (id: string) =>
    db.run(
      `INSERT INTO _pending_command_results (command_id, status, result, recorded_at)
       VALUES (?, 'applied', 'dropped from the queue', ?)`,
      [id, new Date().toISOString()],
    );

  const sentBody = () => apiClient.pushChanges.mock.calls[0]?.[0];

  it("still sends the outcome, with no changes", async () => {
    recordOutcome("cmd-1");

    await pushChanges();

    expect(apiClient.pushChanges).toHaveBeenCalledTimes(1);
    expect(sentBody().changes).toEqual([]);
    expect(sentBody().sync_command_results).toEqual([
      expect.objectContaining({ id: "cmd-1", status: "applied" }),
    ]);
  });

  it("clears the outcome only after the server has acknowledged it", async () => {
    recordOutcome("cmd-2");
    apiClient.pushChanges.mockRejectedValueOnce(new Error("offline"));

    await pushChanges();

    const stillQueued = db.exec(`SELECT command_id FROM _pending_command_results`);
    expect(stillQueued[0]?.values?.[0]?.[0]).toBe("cmd-2");

    apiClient.pushChanges.mockResolvedValue({ success: true, failed: [] });
    await pushChanges();

    expect(db.exec(`SELECT command_id FROM _pending_command_results`)).toEqual([]);
  });

  it("applies a command the server hands back to an idle device", async () => {
    recordOutcome("cmd-3");
    apiClient.pushChanges.mockResolvedValue({
      success: true,
      failed: [],
      sync_commands: [
        { id: "cmd-4", action: "abandon", table_name: "feedback", record_id: "f1" },
      ],
    });

    await pushChanges();

    const results = db.exec(`SELECT command_id FROM _pending_command_results`);
    expect(results[0]?.values?.flat()).toContain("cmd-4");
  });

  /** An idle device with nothing to report must not generate traffic. */
  it("sends nothing at all when there is no outcome and nothing queued", async () => {
    await pushChanges();

    expect(apiClient.pushChanges).not.toHaveBeenCalled();
  });

  /**
   * The case the whole command channel exists for. A stuck row is by
   * definition one whose retries have backed off, and getPendingSyncItems()
   * excludes a backed-off row from an auto-sync - so the device would never
   * send anything, and the `retry` command issued FOR that row could never
   * reach it. The queue is not empty; it is just not due.
   */
  it("asks for commands when the only queued row is backed off out of reach", async () => {
    const future = new Date(Date.now() + 60 * 60 * 1000).toISOString();
    db.run(
      `INSERT INTO _sync_queue (table_name, record_id, operation, payload, created_at, retry_count, next_retry_at, last_error)
       VALUES ('feedback', 'stuck-1', 'INSERT', '{}', ?, 5, ?, 'forbidden')`,
      [new Date().toISOString(), future],
    );

    await pushChanges();

    expect(apiClient.pushChanges).toHaveBeenCalledTimes(1);
    expect(sentBody().changes).toEqual([]);
  });
});
