import { describe, it, expect, beforeAll, beforeEach, afterEach, vi } from "vitest";
import { waitFor } from "@testing-library/react";
import initSqlJs, { type Database } from "sql.js";
import { set as idbSet } from "idb-keyval";
import type { AuditItem } from "@/components/stock-batch/stock-audits";

vi.mock("idb-keyval", () => ({
  get: vi.fn(() => Promise.resolve(undefined)),
  set: vi.fn(() => Promise.resolve(undefined)),
}));
vi.mock("@/lib/hooks/use-pos-cart", () => ({ clearPOSCartStorage: vi.fn() }));

const LEGACY_KEY = "stock-audit-draft";

function row(overrides: Partial<AuditItem> = {}): AuditItem {
  return {
    id: "p1",
    name: "Panadol",
    sku: "SKU-1",
    category: "Analgesics",
    systemQty: 10,
    ...overrides,
  };
}

describe("cycle count draft durability", () => {
  let db: Database;
  let core: typeof import("@/lib/db/core");
  let drafts: typeof import("@/lib/hooks/use-stock-audit-draft");

  beforeAll(async () => {
    core = await import("@/lib/db/core");
    drafts = await import("@/lib/hooks/use-stock-audit-draft");
    const { SCHEMA_SQL } = await import("@/lib/db/schema");
    const SQL = await initSqlJs({
      locateFile: () => require.resolve("sql.js/dist/sql-wasm.wasm"),
    });
    db = new SQL.Database();
    db.run(SCHEMA_SQL);
    core.__setDatabaseForTesting(db);
  });

  beforeEach(() => {
    db.run("DELETE FROM stock_audit_drafts");
    localStorage.clear();
    core.setActiveStoreId(null);
    drafts.useStockAuditDraftStore.setState({
      items: [],
      drafts: {},
      activeStoreId: null,
      loadedStoreId: null,
    });
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  function sqliteDraft(storeId: string): AuditItem[] | null {
    const res = db.exec("SELECT items_json FROM stock_audit_drafts WHERE store_id = ?", [
      storeId,
    ]);
    return res.length === 0 ? null : (JSON.parse(res[0].values[0][0] as string) as AuditItem[]);
  }

  function seedSqlite(storeId: string, items: AuditItem[]) {
    db.run(
      "INSERT INTO stock_audit_drafts (store_id, user_id, items_json, updated_at) VALUES (?, NULL, ?, ?)",
      [storeId, JSON.stringify(items), new Date().toISOString()],
    );
  }

  async function open(storeId: string) {
    drafts.useStockAuditDraftStore.getState().setActiveStoreId(storeId);
    await waitFor(() =>
      expect(drafts.useStockAuditDraftStore.getState().loadedStoreId).toBe(storeId),
    );
  }

  it("never writes the count sheet into localStorage", () => {
    drafts.useStockAuditDraftStore.getState().setActiveStoreId("store-a");
    drafts.useStockAuditDraftStore.getState().setItems([row({ countedQty: 3, counted: true })]);
    expect(localStorage.getItem(LEGACY_KEY)).toBeNull();
  });

  it("restores the SQLite draft over a stale localStorage copy on reload", async () => {
    seedSqlite("store-a", [row({ countedQty: 9, counted: true })]);
    localStorage.setItem(
      LEGACY_KEY,
      JSON.stringify({
        state: { drafts: { "store-a": [row({ countedQty: 4, counted: true })] } },
        version: 2,
      }),
    );

    await open("store-a");

    expect(drafts.useStockAuditDraftStore.getState().items[0].countedQty).toBe(9);
    expect(sqliteDraft("store-a")?.[0].countedQty).toBe(9);
  });

  it("migrates a legacy localStorage draft into SQLite exactly once", async () => {
    localStorage.setItem(
      LEGACY_KEY,
      JSON.stringify({
        state: {
          activeStoreId: "store-a",
          items: [row({ countedQty: 4, counted: true })],
          drafts: {
            "store-a": [row({ countedQty: 4, counted: true })],
            "store-b": [row({ id: "p2", countedQty: 7, counted: true })],
          },
        },
        version: 2,
      }),
    );

    await open("store-a");

    expect(drafts.useStockAuditDraftStore.getState().items[0].countedQty).toBe(4);
    expect(sqliteDraft("store-a")?.[0].countedQty).toBe(4);
    expect(sqliteDraft("store-b")?.[0].countedQty).toBe(7);
    expect(localStorage.getItem(LEGACY_KEY)).toBeNull();

    db.run("DELETE FROM stock_audit_drafts WHERE store_id = 'store-b'");
    await open("store-b");
    expect(sqliteDraft("store-b")).toBeNull();
  });

  it("adopts a pre-store-scoping legacy draft into the store being opened", async () => {
    localStorage.setItem(
      LEGACY_KEY,
      JSON.stringify({
        state: { items: [row({ countedQty: 10 }), row({ id: "p2", countedQty: 6 })] },
        version: 0,
      }),
    );

    await open("store-main");

    const restored = drafts.useStockAuditDraftStore.getState().items;
    expect(restored.map((i) => i.countedQty)).toEqual([undefined, 6]);
    expect(sqliteDraft("store-main")?.map((i) => i.countedQty)).toEqual([undefined, 6]);
  });

  function legacyBlob(storeId: string, items: AuditItem[]): string {
    return JSON.stringify({ state: { drafts: { [storeId]: items } }, version: 2 });
  }

  it("keeps the legacy key when the database copy could not be saved to IndexedDB", async () => {
    const blob = legacyBlob("store-a", [row({ countedQty: 4, counted: true })]);
    localStorage.setItem(LEGACY_KEY, blob);
    vi.mocked(idbSet).mockRejectedValue(new Error("QuotaExceededError"));
    try {
      await open("store-a");
    } finally {
      vi.mocked(idbSet).mockResolvedValue(undefined);
    }
    expect(localStorage.getItem(LEGACY_KEY)).toBe(blob);

    drafts.useStockAuditDraftStore.setState({ drafts: {}, items: [], activeStoreId: null, loadedStoreId: null });
    await open("store-a");
    expect(localStorage.getItem(LEGACY_KEY)).toBeNull();
    expect(sqliteDraft("store-a")?.[0].countedQty).toBe(4);
  });

  it.each([
    ["an uncounted sheet", [row(), row({ id: "p2" })]],
    ["an empty sheet", []],
  ])("imports a counted legacy draft over %s already in SQLite", async (_label, existing) => {
    seedSqlite("store-a", existing);
    localStorage.setItem(LEGACY_KEY, legacyBlob("store-a", [row({ countedQty: 4, counted: true })]));

    await open("store-a");

    expect(drafts.useStockAuditDraftStore.getState().items[0].countedQty).toBe(4);
    expect(sqliteDraft("store-a")?.[0].countedQty).toBe(4);
  });

  it("does not replace an uncounted SQLite sheet with an uncounted legacy one", async () => {
    seedSqlite("store-a", [row({ id: "p9" })]);
    localStorage.setItem(LEGACY_KEY, legacyBlob("store-a", [row()]));

    await open("store-a");

    expect(sqliteDraft("store-a")?.map((i) => i.id)).toEqual(["p9"]);
  });

  it("does not migrate a legacy draft until the database is available", async () => {
    const blob = JSON.stringify({
      state: { drafts: { "store-a": [row({ countedQty: 4, counted: true })] } },
      version: 2,
    });
    localStorage.setItem(LEGACY_KEY, blob);
    const { importLegacyStockAuditDrafts } = await import(
      "@/lib/hooks/stock-audit-draft-legacy"
    );
    core.__setDatabaseForTesting(null as unknown as Database);
    try {
      await importLegacyStockAuditDrafts("store-a");
    } finally {
      core.__setDatabaseForTesting(db);
    }
    expect(localStorage.getItem(LEGACY_KEY)).toBe(blob);
  });

  it("writes a count to SQLite as soon as the page is hidden, before the debounce fires", async () => {
    await open("store-a");
    vi.useFakeTimers();
    drafts.useStockAuditDraftStore.getState().setItems([row({ countedQty: 5, counted: true })]);
    expect(sqliteDraft("store-a")).toBeNull();

    window.dispatchEvent(new Event("pagehide"));
    vi.useRealTimers();

    await waitFor(() => expect(sqliteDraft("store-a")?.[0].countedQty).toBe(5));
  });

  it("holds a count made before any store resolves and files it under the store once known", async () => {
    drafts.useStockAuditDraftStore.getState().setItems([row({ countedQty: 2, counted: true })]);
    await drafts.flushStockAuditDraftSaves();
    expect(sqliteDraft("default")).toBeNull();

    await open("store-a");

    expect(drafts.useStockAuditDraftStore.getState().items[0].countedQty).toBe(2);
    await waitFor(() => expect(sqliteDraft("store-a")?.[0].countedQty).toBe(2));
  });

  it("does not let a sheet built before the store resolved overwrite that store's counted draft", async () => {
    seedSqlite("store-x", [row({ countedQty: 4, counted: true }), row({ id: "p2" })]);
    drafts.useStockAuditDraftStore.getState().setItems([row(), row({ id: "p2" })]);

    await open("store-x");
    await drafts.flushStockAuditDraftSaves();

    expect(drafts.useStockAuditDraftStore.getState().items[0].countedQty).toBe(4);
    expect(sqliteDraft("store-x")?.[0].countedQty).toBe(4);
  });

  it("adopts an orphaned 'default' SQLite draft into the real store", async () => {
    seedSqlite("default", [row({ countedQty: 8, counted: true })]);

    await open("store-a");

    expect(drafts.useStockAuditDraftStore.getState().items[0].countedQty).toBe(8);
    expect(sqliteDraft("store-a")?.[0].countedQty).toBe(8);
    expect(sqliteDraft("default")).toBeNull();
  });

  it("still wipes every store's count on factory reset or linking a different store", async () => {
    await open("store-a");
    drafts.useStockAuditDraftStore.getState().setItems([row({ countedQty: 5, counted: true })]);
    await drafts.flushStockAuditDraftSaves();
    seedSqlite("store-b", [row({ countedQty: 1, counted: true })]);
    const { clearLocalDrafts } = await import("@/lib/utils/clear-local-drafts");

    clearLocalDrafts();

    expect(drafts.hasActiveStockAuditCount("store-a")).toBe(false);
    await waitFor(() => expect(db.exec("SELECT * FROM stock_audit_drafts")).toEqual([]));
  });
});
