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

const toastWarning = vi.fn();
vi.mock("sonner", () => ({
  toast: {
    warning: (...args: unknown[]) => toastWarning(...args),
  },
}));

/**
 * Regression coverage for _known-bugs.md #11's client-side conflict
 * handling: a `version_conflict` (or legacy `stale_timestamp`) entry in
 * response.failed means this exact edit's base version is permanently
 * stale — retrying it through recordSyncFailure's exponential-backoff path
 * can never succeed, since the base version doesn't change no matter how
 * many times it's resent. push.ts must instead drop the item from
 * `_sync_queue` outright and surface a visible, "loud not silent" signal
 * (a toast), rather than the old silent-retry-forever (or silent-accept)
 * behavior.
 */
describe("pushChanges handles a version_conflict failure as non-retryable", () => {
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
    db.run(`DELETE FROM products; DELETE FROM _sync_queue;`);
    vi.clearAllMocks();
    toastWarning.mockClear();
  });

  function queueOneUpdate() {
    db.run(`INSERT INTO products (id, name, selling_price, _version, _deleted) VALUES ('p1', 'Maca Gummies', 777, 1, 0)`);
    db.run(
      `INSERT INTO _sync_queue (id, table_name, record_id, operation, payload, created_at)
       VALUES (1, 'products', 'p1', 'UPDATE', ?, '2026-09-04T00:00:00Z')`,
      [JSON.stringify({ id: "p1", selling_price: 777, _version: 1 })],
    );
  }

  it("removes a version_conflict item from _sync_queue instead of retrying it, and does not mark it synced", async () => {
    queueOneUpdate();
    apiClient.pushChanges.mockResolvedValueOnce({
      success: true,
      processed: 0,
      failed: [{ id: 1, table_name: "products", record_id: "p1", reason: "version_conflict" }],
    });

    const result = await pushChanges();

    // Not counted as pushed (it was rejected), but also not left to retry.
    expect(result.pushed).toBe(0);

    const remaining = db.exec(`SELECT id FROM _sync_queue`);
    expect(remaining.length).toBe(0); // The queue item is gone.
  });

  it("does NOT route a version_conflict through recordSyncFailure's backoff path (no retry_count/next_retry_at bump anywhere, because the row was deleted, not updated)", async () => {
    queueOneUpdate();
    apiClient.pushChanges.mockResolvedValueOnce({
      success: true,
      processed: 0,
      failed: [{ id: 1, table_name: "products", record_id: "p1", reason: "version_conflict" }],
    });

    await pushChanges();

    // If this had gone through recordSyncFailure, the row would still exist
    // with retry_count = 1 instead of being deleted outright.
    const row = db.exec(`SELECT * FROM _sync_queue WHERE id = 1`);
    expect(row.length).toBe(0);
  });

  it("surfaces a visible toast naming the conflicted record, not a silent drop", async () => {
    queueOneUpdate();
    apiClient.pushChanges.mockResolvedValueOnce({
      success: true,
      processed: 0,
      failed: [{ id: 1, table_name: "products", record_id: "p1", reason: "version_conflict" }],
    });

    await pushChanges();

    expect(toastWarning).toHaveBeenCalledTimes(1);
    const message = toastWarning.mock.calls[0][0] as string;
    // Deliberately does not assert (or claim) "another device" — the client
    // can't actually verify who/what changed the record server-side, only
    // that this edit no longer matches what it was based on. See push.ts's
    // toast wording comment.
    expect(message).toContain("could not be saved");
    expect(message.toLowerCase()).toContain("product");
  });

  it("mutes the toast for a version_conflict on an item that was already retried (likely its own prior attempt already landed)", async () => {
    // Simulates a lost-response scenario: this queue row's first send
    // already timed out once (recordSyncFailure bumped retry_count to 1
    // before this, the retried, send). The version_conflict this retry now
    // hits is very likely this device colliding with its own earlier,
    // actually-successful write, not a genuinely conflicting edit.
    db.run(`INSERT INTO products (id, name, selling_price, _version, _deleted) VALUES ('p1', 'Maca Gummies', 777, 1, 0)`);
    db.run(
      `INSERT INTO _sync_queue (id, table_name, record_id, operation, payload, created_at, retry_count)
       VALUES (1, 'products', 'p1', 'UPDATE', ?, '2026-09-04T00:00:00Z', 1)`,
      [JSON.stringify({ id: "p1", selling_price: 777, _version: 1 })],
    );

    const infoSpy = vi.spyOn(console, "info").mockImplementation(() => {});
    apiClient.pushChanges.mockResolvedValueOnce({
      success: true,
      processed: 0,
      failed: [{ id: 1, table_name: "products", record_id: "p1", reason: "version_conflict" }],
    });

    await pushChanges();

    // Still dropped from the queue like any other version_conflict...
    const remaining = db.exec(`SELECT id FROM _sync_queue`);
    expect(remaining.length).toBe(0);
    // ...but no user-facing toast this time, just a quiet log.
    expect(toastWarning).not.toHaveBeenCalled();
    expect(infoSpy).toHaveBeenCalled();
    infoSpy.mockRestore();
  });

  it("still routes an ordinary (non-conflict) failure reason through the normal backoff path, unaffected by this change", async () => {
    queueOneUpdate();
    apiClient.pushChanges.mockResolvedValueOnce({
      success: true,
      processed: 0,
      failed: [{ id: 1, table_name: "products", record_id: "p1", reason: "Some other server error" }],
    });

    await pushChanges();

    // Not deleted — still present, tracked for retry via recordSyncFailure.
    const row = db.exec(`SELECT retry_count FROM _sync_queue WHERE id = 1`);
    expect(row.length).toBe(1);
    expect(row[0].values[0][0]).toBe(1);

    // No conflict toast for an ordinary retryable failure.
    expect(toastWarning).not.toHaveBeenCalled();
  });

  it("sends the record's CURRENT local _version, not a stale one frozen into the queue payload (Critical bug fix)", async () => {
    // Reproduces the mid-flight-edit race: an earlier push for this record
    // already completed and bumped the local row's _version to 2 (e.g. via
    // the `versions` handling exercised in the test below), but THIS queue
    // row was created by an update() call that ran before that bump landed,
    // so its frozen payload still carries the old _version: 1. Without
    // re-reading the current version at send time, this payload would be
    // sent as-is, collide against the server's already-bumped version, and
    // get dropped as a false "version_conflict" - silently losing a
    // completely ordinary, non-conflicting edit.
    db.run(`INSERT INTO products (id, name, selling_price, _version, _deleted) VALUES ('p3', 'Ibuprofen', 850, 2, 0)`);
    db.run(
      `INSERT INTO _sync_queue (id, table_name, record_id, operation, payload, created_at)
       VALUES (3, 'products', 'p3', 'UPDATE', ?, '2026-09-04T00:00:00Z')`,
      [JSON.stringify({ id: "p3", selling_price: 850, _version: 1 })], // stale!
    );

    apiClient.pushChanges.mockResolvedValueOnce({
      success: true,
      processed: 1,
      failed: [],
    });

    const result = await pushChanges();

    expect(result.pushed).toBe(1);
    const sentChanges = apiClient.pushChanges.mock.calls[0][0].changes;
    expect(sentChanges).toHaveLength(1);
    expect(sentChanges[0].payload._version).toBe(2); // current, not the stale 1
  });

  it("falls back to the frozen _version (and still pushes the rest of the batch) when the re-read query itself fails", async () => {
    // A queue row naming a table that doesn't exist locally (e.g. a stale
    // row from a schema this device hasn't migrated) makes the re-read
    // query throw. That must not reject the whole batch's Promise.all and
    // take every other item in it down too - it should fall back to the
    // frozen value for just this one item.
    db.run(
      `INSERT INTO _sync_queue (id, table_name, record_id, operation, payload, created_at)
       VALUES (4, 'no_such_table', 'x1', 'UPDATE', ?, '2026-09-04T00:00:00Z')`,
      [JSON.stringify({ id: "x1", some_field: 1, _version: 1 })],
    );
    db.run(`INSERT INTO products (id, name, selling_price, _version, _deleted) VALUES ('p4', 'Amoxicillin', 400, 1, 0)`);
    db.run(
      `INSERT INTO _sync_queue (id, table_name, record_id, operation, payload, created_at)
       VALUES (5, 'products', 'p4', 'UPDATE', ?, '2026-09-04T00:00:00Z')`,
      [JSON.stringify({ id: "p4", selling_price: 400, _version: 1 })],
    );

    apiClient.pushChanges.mockResolvedValueOnce({
      success: true,
      processed: 2,
      failed: [],
    });

    const result = await pushChanges();

    expect(result.pushed).toBe(2);
    const sentChanges = apiClient.pushChanges.mock.calls[0][0].changes;
    const badTableChange = sentChanges.find((c: { record_id: string }) => c.record_id === "x1");
    const normalChange = sentChanges.find((c: { record_id: string }) => c.record_id === "p4");
    expect(badTableChange.payload._version).toBe(1); // frozen fallback, not thrown
    expect(normalChange.payload._version).toBe(1); // unaffected by the other item's failure
  });

  it("applies the server's authoritative returned version to the local row for an accepted UPDATE", async () => {
    db.run(`INSERT INTO products (id, name, selling_price, _version, _deleted) VALUES ('p2', 'Panadol', 600, 1, 0)`);
    db.run(
      `INSERT INTO _sync_queue (id, table_name, record_id, operation, payload, created_at)
       VALUES (2, 'products', 'p2', 'UPDATE', ?, '2026-09-04T00:00:00Z')`,
      [JSON.stringify({ id: "p2", selling_price: 600, _version: 1 })],
    );

    apiClient.pushChanges.mockResolvedValueOnce({
      success: true,
      processed: 1,
      failed: [],
      versions: { products: { p2: 2 } },
    });

    const result = await pushChanges();

    expect(result.pushed).toBe(1);
    const row = db.exec(`SELECT _version FROM products WHERE id = 'p2'`);
    expect(row[0].values[0][0]).toBe(2);
  });
});
