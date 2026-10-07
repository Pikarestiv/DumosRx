import { describe, it, expect, beforeAll, beforeEach, vi } from "vitest";
import initSqlJs, { type Database } from "sql.js";

vi.mock("idb-keyval", () => ({
  get: vi.fn(async () => undefined),
  set: vi.fn(async () => undefined),
}));

/**
 * A-153. `clearDatabaseForNewStore()` wipes every table but left a set of
 * localStorage caches behind, so the old account's state leaked into the new
 * one — most visibly the old store's product-name autocomplete.
 *
 * The question each key has to answer is whether it describes **this device**
 * (survives) or **this device's relationship with the account/store being
 * replaced** (must go).
 */
describe("clearDatabaseForNewStore clears account-scoped caches", () => {
  let db: Database;
  let core: typeof import("@/lib/db/core");
  let STORAGE_KEYS: typeof import("@/lib/storage-keys").STORAGE_KEYS;

  beforeAll(async () => {
    core = await import("@/lib/db/core");
    ({ STORAGE_KEYS } = await import("@/lib/storage-keys"));

    const { SCHEMA_SQL } = await import("@/lib/db/schema");
    const SQL = await initSqlJs({
      locateFile: () => require.resolve("sql.js/dist/sql-wasm.wasm"),
    });
    db = new SQL.Database();
    db.run(SCHEMA_SQL);
    core.__setDatabaseForTesting(db);
  });

  beforeEach(() => {
    localStorage.clear();
  });

  it("clears every cache tied to the account or store being replaced", async () => {
    const accountScoped = [
      STORAGE_KEYS.suggestions,
      STORAGE_KEYS.syncUniqueSkipCounts,
      STORAGE_KEYS.syncHealthDeficitState,
      STORAGE_KEYS.lastSyncHealthCheck,
      STORAGE_KEYS.orphanRequeueMarker,
      STORAGE_KEYS.lastAuditLogPrune,
      STORAGE_KEYS.posCart,
    ];

    for (const key of accountScoped) {
      localStorage.setItem(key, '{"stale":true}');
    }

    await core.clearDatabaseForNewStore();

    for (const key of accountScoped) {
      expect(localStorage.getItem(key), `${key} must not survive a store switch`).toBeNull();
    }
  });

  it("leaves device-level settings alone", async () => {
    const deviceScoped = [
      STORAGE_KEYS.deviceId,
      STORAGE_KEYS.apiUrl,
      STORAGE_KEYS.sidebarCollapsed,
      STORAGE_KEYS.receiptPaperSize,
      STORAGE_KEYS.tourCompleted,
    ];

    for (const key of deviceScoped) {
      localStorage.setItem(key, "keep-me");
    }

    await core.clearDatabaseForNewStore();

    for (const key of deviceScoped) {
      expect(localStorage.getItem(key), `${key} describes the device, not the account`).toBe("keep-me");
    }
  });

  /**
   * Security, not tidiness: the lockout is a device-level brute-force
   * control. Clearing it here would make "switch store" a way to reset a
   * lockout without knowing any credential.
   */
  it("never clears the login lockout", async () => {
    localStorage.setItem(STORAGE_KEYS.loginLockout, '{"until":9999999999999}');

    await core.clearDatabaseForNewStore();

    expect(localStorage.getItem(STORAGE_KEYS.loginLockout)).not.toBeNull();
  });
});
