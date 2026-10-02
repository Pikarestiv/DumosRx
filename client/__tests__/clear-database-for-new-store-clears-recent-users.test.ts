import { describe, it, expect, beforeAll, beforeEach, vi } from "vitest";
import initSqlJs, { type SqlJsStatic, type Database } from "sql.js";
import { SCHEMA_SQL } from "@/lib/db/schema";

/**
 * A-152 (docs/FIXED_BUGS.md): the login picker's tiles come from a
 * localStorage cache `clearDatabaseForNewStore()` never touched, so a
 * disassociated account's tile survived the exact wipe meant to erase it.
 */

vi.mock("idb-keyval", () => ({
  get: vi.fn(async () => undefined),
  set: vi.fn(async () => {}),
  del: vi.fn(async () => {}),
}));

const isWriterTab = vi.fn(() => true);

vi.mock("@/lib/db/tab-lock", () => ({
  initWriterLock: vi.fn(async () => {}),
  isWriterTab: () => isWriterTab(),
  onWriterTabChange: () => () => {},
  onPromotionFailed: () => () => {},
  requestWriterHandoff: vi.fn(),
  forceWriterTakeover: vi.fn(),
}));

describe("clearDatabaseForNewStore()", () => {
  let core: typeof import("@/lib/db/core");
  let storageKeys: typeof import("@/lib/storage-keys");
  let SQL: SqlJsStatic;
  let db: Database;

  beforeAll(async () => {
    core = await import("@/lib/db/core");
    storageKeys = await import("@/lib/storage-keys");
    SQL = await initSqlJs({
      locateFile: () => require.resolve("sql.js/dist/sql-wasm.wasm"),
    });
  });

  beforeEach(() => {
    localStorage.clear();
    isWriterTab.mockReturnValue(true);
    db = new SQL.Database();
    db.run(SCHEMA_SQL);
    core.__setDatabaseForTesting(db);

    db.run(
      `INSERT INTO users (id, first_name, last_name, username, pin, role, store_id, is_active)
       VALUES ('old-user-1', 'Pika', 'Owner', 'pika', 'hash', 'admin', 'old-store-1', 1)`,
    );
    storageKeys.setRecentUsers([
      { id: "old-user-1", name: "Pika", role: "admin" } as never,
    ]);
  });

  it("clears the stale recent-users cache along with the users/stores tables", async () => {
    expect(storageKeys.getRecentUsers()).toHaveLength(1);

    await core.clearDatabaseForNewStore();

    expect(storageKeys.getRecentUsers()).toEqual([]);
    const remainingUsers = db.exec("SELECT id FROM users");
    expect(remainingUsers).toEqual([]);
  });
});
