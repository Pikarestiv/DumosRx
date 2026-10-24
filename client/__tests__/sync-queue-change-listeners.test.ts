import { describe, it, expect, beforeAll, vi } from "vitest";
import initSqlJs from "sql.js";

// transaction() persists via idb-keyval when not running in Tauri; stub it out since jsdom has no real IndexedDB and we on…
// Rationale: docs/CLIENT_COMMENTS.md#line-__tests__-sync-queue-change-listeners-test-ts-L4
vi.mock("idb-keyval", () => ({
  get: vi.fn(() => Promise.resolve(undefined)),
  set: vi.fn(() => Promise.resolve(undefined)),
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

  it("passes the touched table name to the listener outside a transaction", () => {
    const calls: string[][] = [];
    const unsubscribe = addSyncQueueChangeListener((tables) => calls.push(tables));

    queueTableInvalidation("audit_logs");

    unsubscribe();
    expect(calls).toEqual([["audit_logs"]]);
  });

  it("batches notifications into exactly one call after a transaction commits, even with multiple table touches", async () => {
    const calls: number[] = [];
    const unsubscribe = addSyncQueueChangeListener(() => calls.push(1));

    await transaction(() => {
      queueTableInvalidation("products");
      queueTableInvalidation("stock_batches");
      queueTableInvalidation("products");
      return Promise.resolve();
    });

    unsubscribe();
    expect(calls.length).toBe(1);
  });

  it("passes every distinct touched table to the batched post-transaction notification", async () => {
    const calls: string[][] = [];
    const unsubscribe = addSyncQueueChangeListener((tables) => calls.push(tables));

    await transaction(() => {
      queueTableInvalidation("sales");
      queueTableInvalidation("audit_logs");
      queueTableInvalidation("sales");
      return Promise.resolve();
    });

    unsubscribe();
    expect(calls.length).toBe(1);
    expect(new Set(calls[0])).toEqual(new Set(["sales", "audit_logs"]));
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
