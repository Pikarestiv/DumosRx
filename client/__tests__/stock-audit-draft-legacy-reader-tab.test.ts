import { describe, it, expect, beforeAll, vi } from "vitest";
import { waitFor } from "@testing-library/react";
import initSqlJs, { type Database } from "sql.js";
import { set as idbSet } from "idb-keyval";

vi.mock("idb-keyval", () => ({
  get: vi.fn(() => Promise.resolve(undefined)),
  set: vi.fn(() => Promise.resolve(undefined)),
}));

type LockCallback = (lock: unknown) => Promise<unknown> | unknown;

const LEGACY_KEY = "stock-audit-draft";
const EMPTY_LEGACY_BLOB = JSON.stringify({ state: { items: [], drafts: {} }, version: 2 });

describe("legacy cycle count import in a read-only tab", () => {
  let db: Database;
  let grantQueuedLock: () => void = () => {};

  beforeAll(async () => {
    Object.defineProperty(navigator, "locks", {
      configurable: true,
      value: {
        request: (_name: string, opts: { ifAvailable?: boolean }, cb: LockCallback) => {
          if (opts.ifAvailable) return Promise.resolve(cb(null));
          return new Promise((resolve) => {
            grantQueuedLock = () => resolve(cb({}));
          });
        },
      },
    });
    const SQL = await initSqlJs({ locateFile: () => require.resolve("sql.js/dist/sql-wasm.wasm") });
    const { SCHEMA_SQL } = await import("@/lib/db/schema");
    db = new SQL.Database();
    db.run(SCHEMA_SQL);
    (await import("@/lib/db/core")).__setDatabaseForTesting(db);
  });

  it("leaves IndexedDB and the legacy key alone until the tab becomes the writer", async () => {
    const tabLock = await import("@/lib/db/tab-lock");
    const core = await import("@/lib/db/core");
    const { importLegacyStockAuditDrafts } = await import("@/lib/hooks/stock-audit-draft-legacy");
    void tabLock.initWriterLock(() => Promise.resolve(true), () => Promise.resolve());
    await waitFor(() => expect(tabLock.isWriterTab()).toBe(false));
    localStorage.setItem(LEGACY_KEY, EMPTY_LEGACY_BLOB);

    await importLegacyStockAuditDrafts("store-a");

    expect(idbSet).not.toHaveBeenCalled();
    expect(localStorage.getItem(LEGACY_KEY)).toBe(EMPTY_LEGACY_BLOB);
    expect(await core.saveDatabase()).toBe(false);
    expect(idbSet).not.toHaveBeenCalled();

    grantQueuedLock();
    await waitFor(() => expect(tabLock.isWriterTab()).toBe(true));
    await importLegacyStockAuditDrafts("store-a");

    expect(idbSet).toHaveBeenCalled();
    expect(localStorage.getItem(LEGACY_KEY)).toBeNull();
  });
});
