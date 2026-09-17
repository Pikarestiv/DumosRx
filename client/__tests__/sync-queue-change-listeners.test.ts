import { describe, it, expect, beforeAll, vi } from "vitest";
import initSqlJs from "sql.js";

// transaction() persists via idb-keyval when not running in Tauri; stub it
// out since jsdom has no real IndexedDB and we only care about the
// notification-batching semantics here, not persistence. Same stub as
// db-transaction.test.ts.
vi.mock("idb-keyval", () => ({
  get: vi.fn(async () => undefined),
  set: vi.fn(async () => undefined),
}));

describe("addSyncQueueChangeListener", () => {
  let transaction: typeof import("@/lib/db/core").transaction;
  let queueTableInvalidation: typeof import("@/lib/db/core").queueTableInvalidation;
  let addSyncQueueChangeListener: typeof import("@/lib/db/core").addSyncQueueChangeListener;

  beforeAll(async () => {
    const core = await import("@/lib/db/core");
    transaction = core.transaction;
    queueTableInvalidation = core.queueTableInvalidation;
    addSyncQueueChangeListener = core.addSyncQueueChangeListener;

    const SQL = await initSqlJs({
      locateFile: () => require.resolve("sql.js/dist/sql-wasm.wasm"),
    });
    const db = new SQL.Database();
    core.__setDatabaseForTesting(db);
  });

  it("notifies a listener once per call outside a transaction", () => {
    const calls: number[] = [];
    const unsubscribe = addSyncQueueChangeListener(() => calls.push(1));

    queueTableInvalidation("products");
    queueTableInvalidation("products");

    unsubscribe();
    expect(calls.length).toBe(2);
  });

  it("batches notifications into exactly one call after a transaction commits, even with multiple table touches", async () => {
    const calls: number[] = [];
    const unsubscribe = addSyncQueueChangeListener(() => calls.push(1));

    await transaction(async () => {
      queueTableInvalidation("products");
      queueTableInvalidation("stock_batches");
      queueTableInvalidation("products");
    });

    unsubscribe();
    expect(calls.length).toBe(1);
  });

  it("does not notify after unsubscribe", () => {
    const calls: number[] = [];
    const unsubscribe = addSyncQueueChangeListener(() => calls.push(1));
    unsubscribe();

    queueTableInvalidation("products");
    expect(calls.length).toBe(0);
  });

  it("notifies every subscribed listener independently, so one instance unsubscribing doesn't silence another", () => {
    const callsA: number[] = [];
    const callsB: number[] = [];
    const unsubscribeA = addSyncQueueChangeListener(() => callsA.push(1));
    const unsubscribeB = addSyncQueueChangeListener(() => callsB.push(1));

    unsubscribeA();
    queueTableInvalidation("products");

    expect(callsA.length).toBe(0);
    expect(callsB.length).toBe(1);
    unsubscribeB();
  });
});
