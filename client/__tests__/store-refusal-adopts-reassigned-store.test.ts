import { describe, it, expect, beforeAll, beforeEach, vi } from "vitest";
import initSqlJs, { type Database } from "sql.js";

vi.mock("idb-keyval", () => ({
  get: vi.fn(() => Promise.resolve(undefined)),
  set: vi.fn(() => Promise.resolve(undefined)),
}));

const getProfile = vi.fn();
vi.mock("@/lib/api/client", () => ({ apiClient: { getProfile: () => getProfile() } }));

describe("adoptReassignedStore (A-323)", () => {
  let db: Database;
  let core: typeof import("@/lib/db/core");
  let adoptReassignedStore: typeof import("@/lib/db/sync-engine/store-refusal").adoptReassignedStore;
  const refusal = { storeId: "store-b", accessibleStores: [{ id: "store-c", name: "Store C" }] };

  beforeAll(async () => {
    core = await import("@/lib/db/core");
    ({ adoptReassignedStore } = await import("@/lib/db/sync-engine/store-refusal"));
    const { SCHEMA_SQL } = await import("@/lib/db/schema");
    const SQL = await initSqlJs({ locateFile: () => require.resolve("sql.js/dist/sql-wasm.wasm") });
    db = new SQL.Database();
    db.run(SCHEMA_SQL);
    core.__setDatabaseForTesting(db);
  });

  beforeEach(() => {
    db.run(`DELETE FROM users; DELETE FROM _sync_queue;`);
    db.run(`INSERT INTO users (id, username, first_name, store_id, role) VALUES ('ada', 'ada', 'Ada', 'store-b', 'cashier')`);
    core.setCurrentUser({ id: "ada" } as Parameters<typeof core.setCurrentUser>[0]);
    getProfile.mockReset();
  });

  const localStore = () => db.exec(`SELECT store_id FROM users WHERE id = 'ada'`)[0].values[0][0];
  const queued = () => db.exec(`SELECT COUNT(*) FROM _sync_queue`)[0].values[0][0];

  it("copies the server's new store into the local row so the next sign-in uses it, without queueing a push", async () => {
    getProfile.mockResolvedValue({ id: "ada", store_id: "store-c" });

    await expect(adoptReassignedStore(refusal)).resolves.toEqual({ id: "store-c", name: "Store C" });

    expect(localStore()).toBe("store-c");
    expect(queued()).toBe(0);
  });

  it("ignores a profile for another account, such as the owner whose token links the device", async () => {
    getProfile.mockResolvedValue({ id: "owner", store_id: "store-c" });

    await expect(adoptReassignedStore(refusal)).resolves.toBeNull();
    expect(localStore()).toBe("store-b");
  });

  it("ignores a store the refused round did not offer", async () => {
    getProfile.mockResolvedValue({ id: "ada", store_id: "store-z" });

    await expect(adoptReassignedStore(refusal)).resolves.toBeNull();
    expect(localStore()).toBe("store-b");
  });

  it("does not ask the server when the signed-in user's store is not the refused one", async () => {
    db.run(`UPDATE users SET store_id = NULL WHERE id = 'ada'`);

    await expect(adoptReassignedStore(refusal)).resolves.toBeNull();
    expect(getProfile).not.toHaveBeenCalled();
  });
});
