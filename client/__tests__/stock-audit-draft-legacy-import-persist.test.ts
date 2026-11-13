import { describe, it, expect, beforeAll, beforeEach, vi } from "vitest";
import { waitFor } from "@testing-library/react";
import initSqlJs, { type Database } from "sql.js";
import { set as idbSet } from "idb-keyval";
import type { AuditItem } from "@/components/stock-batch/stock-audits";

vi.mock("idb-keyval", () => ({
  get: vi.fn(() => Promise.resolve(undefined)),
  set: vi.fn(() => Promise.resolve(undefined)),
}));

const LEGACY_KEY = "stock-audit-draft";

function row(overrides: Partial<AuditItem> = {}): AuditItem {
  return { id: "p1", name: "Panadol", sku: "SKU-1", category: "c", systemQty: 10, ...overrides };
}

function legacyBlob(items: AuditItem[]): string {
  return JSON.stringify({ state: { drafts: { "store-a": items } }, version: 2 });
}

describe("legacy cycle count import persistence", () => {
  let db: Database;
  let core: typeof import("@/lib/db/core");
  let drafts: typeof import("@/lib/hooks/use-stock-audit-draft");

  beforeAll(async () => {
    core = await import("@/lib/db/core");
    drafts = await import("@/lib/hooks/use-stock-audit-draft");
    const { SCHEMA_SQL } = await import("@/lib/db/schema");
    const SQL = await initSqlJs({ locateFile: () => require.resolve("sql.js/dist/sql-wasm.wasm") });
    db = new SQL.Database();
    db.run(SCHEMA_SQL);
    core.__setDatabaseForTesting(db);
  });

  beforeEach(() => {
    db.run("DELETE FROM stock_audit_drafts");
    db.run("DELETE FROM categories");
    localStorage.clear();
    vi.mocked(idbSet).mockReset().mockResolvedValue(undefined);
    drafts.useStockAuditDraftStore.setState({
      items: [],
      drafts: {},
      activeStoreId: null,
      loadedStoreId: null,
    });
  });

  function sqliteDraft(storeId: string): AuditItem[] | null {
    const res = db.exec("SELECT items_json FROM stock_audit_drafts WHERE store_id = ?", [storeId]);
    return res.length === 0 ? null : (JSON.parse(res[0].values[0][0] as string) as AuditItem[]);
  }

  async function open(storeId: string) {
    drafts.useStockAuditDraftStore.setState({ activeStoreId: null, loadedStoreId: null, drafts: {}, items: [] });
    drafts.useStockAuditDraftStore.getState().setActiveStoreId(storeId);
    await waitFor(() =>
      expect(drafts.useStockAuditDraftStore.getState().loadedStoreId).toBe(storeId),
    );
  }

  it("removes the legacy key once its own import is persisted, even if another write lands meanwhile", async () => {
    localStorage.setItem(LEGACY_KEY, legacyBlob([row({ countedQty: 4, counted: true })]));
    let intrusions = 0;
    vi.mocked(idbSet).mockImplementation(async () => {
      if (intrusions >= 5) return;
      intrusions += 1;
      await core.execute("INSERT INTO categories (id, name) VALUES (?, 'Boot sync')", [`c${intrusions}`]);
    });

    await open("store-a");

    expect(sqliteDraft("store-a")?.[0].countedQty).toBe(4);
    expect(localStorage.getItem(LEGACY_KEY)).toBeNull();
  });

  it("does not resurrect pre-upgrade counts after the sheet was submitted", async () => {
    const blob = legacyBlob([row({ countedQty: 4, counted: true })]);
    localStorage.setItem(LEGACY_KEY, blob);
    vi.mocked(idbSet).mockRejectedValue(new Error("QuotaExceededError"));
    await open("store-a");
    expect(localStorage.getItem(LEGACY_KEY)).toBe(blob);
    vi.mocked(idbSet).mockResolvedValue(undefined);

    drafts.useStockAuditDraftStore.getState().clearDraft("store-a");
    await waitFor(() => expect(sqliteDraft("store-a")).toBeNull());
    await core.saveDatabase();

    await open("store-a");

    expect(drafts.useStockAuditDraftStore.getState().items).toEqual([]);
    expect(sqliteDraft("store-a")).toBeNull();
  });

  it("writes a count made inside the save debounce before handing the writer lock over", async () => {
    await open("store-a");
    vi.useFakeTimers();
    try {
      drafts.useStockAuditDraftStore.getState().setItems([row({ countedQty: 6, counted: true })]);
      expect(sqliteDraft("store-a")).toBeNull();

      await core.saveBeforeWriterHandoff();
    } finally {
      vi.useRealTimers();
    }

    expect(sqliteDraft("store-a")?.[0].countedQty).toBe(6);
    expect(idbSet).toHaveBeenCalled();
  });
});
