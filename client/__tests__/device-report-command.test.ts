import { describe, it, expect, beforeAll, beforeEach, vi } from "vitest";
import initSqlJs, { type Database } from "sql.js";

vi.mock("idb-keyval", () => ({
  get: vi.fn(async () => undefined),
  set: vi.fn(async () => undefined),
}));

const { sentry, delivery } = vi.hoisted(() => ({
  sentry: { messages: [] as string[], throws: false },
  delivery: { calls: 0, throws: false },
}));

vi.mock("@sentry/nextjs", () => ({
  captureMessage: vi.fn((message: string) => {
    if (sentry.throws) throw new Error("no DSN");
    sentry.messages.push(message);
  }),
}));

vi.mock("@/lib/utils/diagnostics-delivery", () => ({
  sendDiagnosticsReport: vi.fn(async () => {
    delivery.calls += 1;
    if (delivery.throws) throw new Error("Could not reach support.");
  }),
}));

/**
 * The ordinary telemetry channel fails exactly when it is needed: crash rows
 * live in `feedback`, which rides the sync queue, so a till whose push is
 * jammed stops reporting at the moment it has most to say.
 */
describe("sendDeviceReportOnRequest", () => {
  let db: Database;
  let core: typeof import("@/lib/db/core");
  let send: typeof import("@/lib/db/sync-engine/device-report-command").sendDeviceReportOnRequest;
  let AUDIT: string;

  beforeAll(async () => {
    core = await import("@/lib/db/core");
    const mod = await import("@/lib/db/sync-engine/device-report-command");
    send = mod.sendDeviceReportOnRequest;
    AUDIT = mod.DEVICE_REPORT_AUDIT_ACTION;

    const { SCHEMA_SQL } = await import("@/lib/db/schema");
    const SQL = await initSqlJs({
      locateFile: () => require.resolve("sql.js/dist/sql-wasm.wasm"),
    });
    db = new SQL.Database();
    db.run(SCHEMA_SQL);
    db.run(`ALTER TABLE products ADD COLUMN store_id TEXT`);
    db.run(`ALTER TABLE stock_batches ADD COLUMN store_id TEXT`);
    core.__setDatabaseForTesting(db);
    core.setActiveStoreId("store-1");
  });

  beforeEach(() => {
    sentry.messages = [];
    sentry.throws = false;
    delivery.calls = 0;
    delivery.throws = false;
    db.run(`DELETE FROM audit_logs; DELETE FROM _sync_queue;`);
  });

  const auditRows = () =>
    db.exec(`SELECT action, details FROM audit_logs`)[0]?.values ?? [];

  it("delivers to both channels and reports applied", async () => {
    const outcome = await send("cmd-1");

    expect(outcome.status).toBe("applied");
    expect(outcome.result).toMatch(/sentry/);
    expect(outcome.result).toMatch(/support/);
    expect(delivery.calls).toBe(1);
    expect(sentry.messages).toHaveLength(1);
  });

  it("records it on the device, so the store can see a report left their till", async () => {
    await send("cmd-1");

    const rows = auditRows();
    expect(rows).toHaveLength(1);
    expect(rows[0][0]).toBe(AUDIT);

    const details = JSON.parse(String(rows[0][1]));
    expect(details.requested_remotely).toBe(true);
    expect(details.delivered_to).toContain("support");
  });

  it("refuses when the support POST fails, because only it can confirm anything", async () => {
    // Sentry.captureMessage never throws: with no DSN it is a silent no-op and
    // transport failures are async. Marking this applied on Sentry alone would
    // record a report nobody received.
    delivery.throws = true;

    const outcome = await send("cmd-1");

    expect(outcome.status).toBe("refused");
    expect(auditRows()).toHaveLength(0);
  });

  it("calls Sentry delivery 'unconfirmed', since it cannot prove anything", async () => {
    await send("cmd-1");

    const details = JSON.parse(String(auditRows()[0][1]));
    expect(details.delivered_to).toMatch(/unconfirmed/);
  });

  it("still succeeds over support alone when Sentry has no DSN", async () => {
    sentry.throws = true;

    const outcome = await send("cmd-1");

    expect(outcome.status).toBe("applied");
    expect(outcome.result).toMatch(/support/);
  });

  it("records the issuing admin as the actor, not whoever is at the till", async () => {
    await send("cmd-1", "admin-7");

    const rows = db.exec(`SELECT user_id FROM audit_logs`)[0].values;
    expect(rows[0][0]).toBe("admin-7");
  });

  it("never writes through the sync queue, which is the thing that may be stuck", async () => {
    await send("cmd-1");

    const queued = db.exec(
      `SELECT table_name FROM _sync_queue`,
    )[0]?.values.map((row) => String(row[0])) ?? [];

    // The audit row queues (it is an audit row like any other), but nothing
    // about the delivery itself depends on the queue draining.
    expect(queued.every((table) => table === "audit_logs")).toBe(true);
  });
});
