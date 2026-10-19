import { describe, it, expect, beforeAll, beforeEach, vi } from "vitest";
import initSqlJs, { type Database } from "sql.js";

vi.mock("idb-keyval", () => ({
  get: vi.fn(async () => undefined),
  set: vi.fn(async () => undefined),
}));

/**
 * "Did the push work" was only ever measured per HTTP attempt, which says
 * nothing about whether an edit was ever delivered. See
 * docs/DEVICE_TABLE_AGREEMENT.md, "Delivery timing".
 */
describe("delivery age", () => {
  let db: Database;
  let core: typeof import("@/lib/db/core");
  let helpers: typeof import("@/lib/db/base-helpers");
  let ages: typeof import("@/lib/db/sync-engine/delivery-age");
  let queueState: typeof import("@/lib/db/sync-engine/queue-state");

  beforeAll(async () => {
    core = await import("@/lib/db/core");
    helpers = await import("@/lib/db/base-helpers");
    ages = await import("@/lib/db/sync-engine/delivery-age");
    queueState = await import("@/lib/db/sync-engine/queue-state");

    const { SCHEMA_SQL } = await import("@/lib/db/schema");
    const SQL = await initSqlJs({
      locateFile: () => require.resolve("sql.js/dist/sql-wasm.wasm"),
    });
    db = new SQL.Database();
    db.run(SCHEMA_SQL);
    core.__setDatabaseForTesting(db);
  });

  beforeEach(() => {
    db.run("DELETE FROM _sync_queue; DELETE FROM sales;");
    core.setActiveStoreId("store-1");
    ages.drainDeliveredAges();
    vi.useRealTimers();
  });

  const queue = (id: number, ageMinutes: number) => {
    const createdAt = new Date(Date.now() - ageMinutes * 60_000).toISOString();
    db.run(
      `INSERT INTO _sync_queue (id, table_name, record_id, operation, payload, created_at)
       VALUES (${id}, 'sales', 'rec-${id}', 'INSERT', '{}', '${createdAt}')`,
    );
  };

  it("buckets each accepted queue row by how long it waited", async () => {
    queue(1, 0.2);
    queue(2, 3);
    queue(3, 30);
    queue(4, 60 * 10);
    queue(5, 60 * 48);

    await helpers.markSynced([1, 2, 3, 4, 5]);

    expect(ages.drainDeliveredAges()).toEqual({
      under_1m: 1,
      under_5m: 1,
      under_1h: 1,
      under_1d: 1,
      over_1d: 1,
    });
  });

  it("drains on read, so a report describes the interval and not all time", async () => {
    queue(1, 0.1);
    await helpers.markSynced([1]);

    expect(ages.drainDeliveredAges()?.under_1m).toBe(1);
    expect(ages.drainDeliveredAges()).toBeNull();
  });

  it("still deletes the queue row when the age cannot be recorded", async () => {
    queue(1, 1);
    const broken = vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => {
      throw new Error("quota");
    });

    await helpers.markSynced([1]);
    broken.mockRestore();

    expect(db.exec("SELECT COUNT(*) FROM _sync_queue")[0].values[0][0]).toBe(0);
  });

  it("reports the age of the oldest unsynced edit, the one number that matters", async () => {
    queue(1, 5);
    queue(2, 90);

    const report = await queueState.buildQueueStateReport("store-1");

    expect(report?.oldest_queued_seconds).toBeGreaterThanOrEqual(90 * 60 - 5);
    expect(report?.oldest_queued_seconds).toBeLessThanOrEqual(90 * 60 + 5);
  });

  it("reports a null oldest age for an empty queue rather than zero", async () => {
    const report = await queueState.buildQueueStateReport("store-1");

    expect(report?.queue_depth).toBe(0);
    expect(report?.oldest_queued_seconds).toBeNull();
  });

  it("carries the drained histogram into the queue-state report", async () => {
    queue(1, 0.1);
    await helpers.markSynced([1]);

    const report = await queueState.buildQueueStateReport("store-1");

    expect(report?.delivered_ages).toEqual({
      under_1m: 1,
      under_5m: 0,
      under_1h: 0,
      under_1d: 0,
      over_1d: 0,
    });
    expect((await queueState.buildQueueStateReport("store-1"))?.delivered_ages).toBeNull();
  });
});


describe("the pasteable device report", () => {
  it("names the age of the oldest unsynced edit and the delivery histogram", async () => {
    const { buildReport } = await import("@/components/settings/diagnostics/diagnostics-report");
    const { recordDeliveredAges, drainDeliveredAges } = await import(
      "@/lib/db/sync-engine/delivery-age"
    );

    drainDeliveredAges();
    recordDeliveredAges([new Date(Date.now() - 2 * 60_000).toISOString()]);

    const report = buildReport(
      {
        queue: [
          {
            table_name: "sales",
            pending: 2,
            retrying: 0,
            oldest: new Date(Date.now() - 125 * 60_000).toISOString(),
            last_error: null,
          },
        ],
        queueTotal: 2,
        crashTelemetryQueued: 0,
        syncState: [],
        pendingDeltas: [],
        deltas: { pending: 0, oldestMinutes: null, unresolvableBatch: 0, unresolvableCategory: 0 },
        conflicts: 0,
        integrity: { divergedBatches: [], netUnitDelta: 0 } as never,
        resolution: {} as never,
        stuckRows: [],
        conflictGroups: [],
        batchConflicts: [],
        batchCosts: [],
        orphans: [],
        crashes: [],
        clock: { watermarkAheadMs: null, status: null, suspensionReason: null, watermark: null },
        missingTables: [],
      } as never,
      { Device: "DRX-TILL-1" },
    );

    expect(report).toContain("Oldest unsynced edit: 2h 5m old");
    expect(report).toContain("Delivered since last report: <1m 0, <5m 1, <1h 0, <1d 0, 1d+ 0");
    expect(drainDeliveredAges()?.under_5m).toBe(1);
  });
});
