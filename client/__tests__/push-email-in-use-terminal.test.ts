import { describe, it, expect, beforeAll, beforeEach, vi } from "vitest";
import initSqlJs, { type Database } from "sql.js";

vi.mock("idb-keyval", () => ({
  get: vi.fn(() => Promise.resolve(undefined)),
  set: vi.fn(() => Promise.resolve(undefined)),
}));

vi.mock("@/lib/api/client", () => ({
  apiClient: {
    pushChanges: vi.fn(),
  },
}));

vi.mock("sonner", () => ({
  toast: {
    warning: vi.fn(),
    error: vi.fn(),
  },
}));

describe("a staff email the server says another account holds (A-397)", () => {
  let db: Database;
  let core: typeof import("@/lib/db/core");
  let pushChanges: typeof import("@/lib/db/sync-engine/push").pushChanges;
  let apiClient: { pushChanges: ReturnType<typeof vi.fn> };
  let toast: { warning: ReturnType<typeof vi.fn>; error: ReturnType<typeof vi.fn> };

  beforeAll(async () => {
    core = await import("@/lib/db/core");
    ({ pushChanges } = await import("@/lib/db/sync-engine/push"));
    ({ apiClient } = (await import("@/lib/api/client")) as unknown as {
      apiClient: { pushChanges: ReturnType<typeof vi.fn> };
    });
    ({ toast } = (await import("sonner")) as unknown as { toast: typeof toast });

    const { SCHEMA_SQL } = await import("@/lib/db/schema");
    const SQL = await initSqlJs({ locateFile: () => require.resolve("sql.js/dist/sql-wasm.wasm") });
    db = new SQL.Database();
    db.run(SCHEMA_SQL);
    core.__setDatabaseForTesting(db);
  });

  beforeEach(() => {
    db.run(`DELETE FROM users; DELETE FROM _sync_queue; DELETE FROM _sync_state;`);
    vi.clearAllMocks();
  });

  const queueStaffEmailEdit = (id: string) => {
    db.run(
      `INSERT INTO users (id, first_name, last_name, username, email, role, store_id, created_at, updated_at, _synced, _version)
       VALUES ('${id}', 'Staff', 'Member', 'staff1', 'josh@dumostech.com', 'sales_staff', 'store-1', '2026-11-18T00:00:00Z', '2026-11-18T00:00:00Z', 0, 3)`,
    );
    const row = db.exec(
      `INSERT INTO _sync_queue (table_name, record_id, operation, payload, created_at)
       VALUES ('users', '${id}', 'UPDATE', '{"id":"${id}","email":"josh@dumostech.com"}', '2026-11-18T00:00:00Z') RETURNING id`,
    );
    return row[0].values[0][0] as number;
  };

  const refuse = (queueId: number, recordId: string) =>
    apiClient.pushChanges.mockResolvedValueOnce({
      success: true,
      processed: 0,
      failed: [{ id: queueId, table_name: "users", record_id: recordId, reason: "email_in_use" }],
    });

  const queueCount = () => db.exec(`SELECT COUNT(*) FROM _sync_queue`)[0].values[0][0] as number;

  it("drops the queued edit instead of retrying it for ever", async () => {
    const queueId = queueStaffEmailEdit("fc3e3a2f-6e9c-4a52-9283-9413a30274aa");
    refuse(queueId, "fc3e3a2f-6e9c-4a52-9283-9413a30274aa");

    await pushChanges();

    expect(queueCount()).toBe(0);
  });

  it("tells the user in plain words, not as a record-changed conflict", async () => {
    const queueId = queueStaffEmailEdit("fc3e3a2f-6e9c-4a52-9283-9413a30274aa");
    refuse(queueId, "fc3e3a2f-6e9c-4a52-9283-9413a30274aa");

    await pushChanges();

    expect(toast.warning).not.toHaveBeenCalled();
    expect(toast.error).toHaveBeenCalledTimes(1);
    expect(String(toast.error.mock.calls[0][0])).toMatch(/email.*already used by another account/i);
  });

  it("still tells the user when an earlier attempt of the same edit had already failed", async () => {
    const queueId = queueStaffEmailEdit("fc3e3a2f-6e9c-4a52-9283-9413a30274aa");
    db.run(`UPDATE _sync_queue SET retry_count = 2 WHERE id = ${queueId}`);
    refuse(queueId, "fc3e3a2f-6e9c-4a52-9283-9413a30274aa");

    await pushChanges();

    expect(toast.error).toHaveBeenCalledTimes(1);
  });

  it("makes the till re-pull its staff so the rejected address does not linger", async () => {
    const queueId = queueStaffEmailEdit("fc3e3a2f-6e9c-4a52-9283-9413a30274aa");
    refuse(queueId, "fc3e3a2f-6e9c-4a52-9283-9413a30274aa");

    await pushChanges();

    const rewound = db.exec(`SELECT rewind_count FROM _sync_state WHERE table_name = 'users'`);
    expect(rewound[0].values[0][0]).toBeGreaterThanOrEqual(1);
  });
});
