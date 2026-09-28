import { describe, it, expect, beforeEach, vi } from "vitest";

/**
 * Regression coverage for A-14 (docs/KNOWN_BUGS.md): the "Reset App Data"
 * button on the database-init error screen cleared `localStorage` and
 * reloaded, but the database itself lives in IndexedDB under `dumosrx_db` —
 * so the corrupt blob survived the "reset", the same error screen came back,
 * and the user had lost their session for nothing.
 */

const idbStore = new Map<string, unknown>();

vi.mock("idb-keyval", () => ({
  get: vi.fn(async (key: string) => idbStore.get(key)),
  set: vi.fn(async (key: string, value: unknown) => {
    idbStore.set(key, value);
  }),
  del: vi.fn(async (key: string) => {
    idbStore.delete(key);
  }),
}));

describe("discardLocalDatabaseBlob()", () => {
  let core: typeof import("@/lib/db/core");

  beforeEach(async () => {
    idbStore.clear();
    delete (window as unknown as { __TAURI_INTERNALS__?: unknown }).__TAURI_INTERNALS__;
    core = await import("@/lib/db/core");
  });

  it("deletes the IndexedDB database key so the next boot starts fresh", async () => {
    idbStore.set("dumosrx_db", new Uint8Array([1, 2, 3]));

    await core.discardLocalDatabaseBlob();

    expect(idbStore.has("dumosrx_db")).toBe(false);
  });

  it("keeps a copy of the unreadable blob under the pre-reset backup key", async () => {
    const corrupt = new Uint8Array([9, 8, 7]);
    idbStore.set("dumosrx_db", corrupt);

    const result = await core.discardLocalDatabaseBlob();

    expect(result).toEqual({ backedUp: true });
    expect(idbStore.get("dumosrx_db_pre_reset_backup")).toBe(corrupt);
  });

  it("still clears the key, and reports no backup, when there was nothing stored", async () => {
    const result = await core.discardLocalDatabaseBlob();

    expect(result).toEqual({ backedUp: false });
    expect(idbStore.has("dumosrx_db_pre_reset_backup")).toBe(false);
  });

  it("leaves the pre-restore snapshot alone — the two safety nets are separate keys", async () => {
    idbStore.set("dumosrx_db", new Uint8Array([1]));
    idbStore.set("dumosrx_db_pre_restore_backup", new Uint8Array([5]));

    await core.discardLocalDatabaseBlob();

    expect(idbStore.get("dumosrx_db_pre_restore_backup")).toEqual(new Uint8Array([5]));
  });

  it("does nothing on the Tauri build, where the database is a file and not this key", async () => {
    (window as unknown as { __TAURI_INTERNALS__?: unknown }).__TAURI_INTERNALS__ = {};
    idbStore.set("dumosrx_db", new Uint8Array([1, 2, 3]));

    const result = await core.discardLocalDatabaseBlob();

    expect(result).toEqual({ backedUp: false });
    expect(idbStore.has("dumosrx_db")).toBe(true);
  });
});
