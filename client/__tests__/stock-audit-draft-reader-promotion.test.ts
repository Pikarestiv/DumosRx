import { describe, it, expect, beforeAll, vi } from "vitest";
import { waitFor } from "@testing-library/react";
import initSqlJs, { type Database } from "sql.js";
import type { AuditItem } from "@/components/stock-batch/stock-audits";

vi.mock("idb-keyval", () => ({
  get: vi.fn(() => Promise.resolve(undefined)),
  set: vi.fn(() => Promise.resolve(undefined)),
}));

type LockCallback = (lock: unknown) => Promise<unknown> | unknown;

function row(overrides: Partial<AuditItem> = {}): AuditItem {
  return { id: "p1", name: "Panadol", sku: "SKU-1", category: "c", systemQty: 10, ...overrides };
}

describe("a read-only tab promoted to writer", () => {
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

  function writeDraftAsTheWriterTab(items: AuditItem[]) {
    db.run(
      "INSERT OR REPLACE INTO stock_audit_drafts (store_id, user_id, items_json, updated_at) VALUES (?, NULL, ?, ?)",
      ["store-a", JSON.stringify(items), new Date().toISOString()],
    );
  }

  function sqliteDraft(): AuditItem[] {
    const res = db.exec("SELECT items_json FROM stock_audit_drafts WHERE store_id = 'store-a'");
    return JSON.parse(res[0].values[0][0] as string) as AuditItem[];
  }

  it("reloads the writer's newer draft instead of saving its own stale sheet over it", async () => {
    const tabLock = await import("@/lib/db/tab-lock");
    const { useStockAuditDraftStore, flushStockAuditDraftSaves } = await import(
      "@/lib/hooks/use-stock-audit-draft"
    );
    void tabLock.initWriterLock(() => Promise.resolve(true), () => Promise.resolve());
    await waitFor(() => expect(tabLock.isWriterTab()).toBe(false));

    writeDraftAsTheWriterTab([row({ countedQty: 4, counted: true }), row({ id: "p2" })]);
    useStockAuditDraftStore.getState().setActiveStoreId("store-a");
    await waitFor(() => expect(useStockAuditDraftStore.getState().loadedStoreId).toBe("store-a"));

    writeDraftAsTheWriterTab([row({ countedQty: 9, counted: true }), row({ id: "p2" })]);
    grantQueuedLock();
    await waitFor(() => expect(tabLock.isWriterTab()).toBe(true));
    await waitFor(() => expect(useStockAuditDraftStore.getState().items[0].countedQty).toBe(9));

    useStockAuditDraftStore
      .getState()
      .setItems((prev) => prev.map((i) => (i.id === "p2" ? { ...i, countedQty: 2, counted: true } : i)));
    await flushStockAuditDraftSaves();

    expect(sqliteDraft().map((i) => i.countedQty)).toEqual([9, 2]);
  });
});
