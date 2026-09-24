import { describe, it, expect, beforeAll, beforeEach, vi } from "vitest";
import { renderHook, act, waitFor } from "@testing-library/react";
import initSqlJs, { type Database } from "sql.js";
import React from "react";

/**
 * POS PINs used to be stored in plaintext in `users.pin` (and serialized
 * out by the API). They're bcrypt-hashed now. Because PIN login is fully
 * offline - it never contacts the server - the migration of PINs that are
 * ALREADY plaintext on a device has to happen here, on the next successful
 * login, and then propagate outward through the ordinary sync queue.
 *
 * These tests pin down that whole path: a legacy plaintext PIN still logs
 * in, and afterwards the stored value is a bcrypt hash of it (queued for
 * push like any other local write), with no user-visible reset anywhere.
 */

vi.mock("@sentry/nextjs", () => ({
  setUser: vi.fn(),
  setTag: vi.fn(),
}));

vi.mock("@/lib/api/client", () => ({
  apiClient: { login: vi.fn(), setToken: vi.fn() },
}));

vi.mock("@/lib/db/sync-engine", () => ({
  sync: vi.fn(async () => ({ success: true })),
  isSyncing: vi.fn(() => false),
}));

vi.mock("@/lib/query-client", () => ({
  queryClient: {
    cancelQueries: vi.fn(async () => {}),
    clear: vi.fn(),
    invalidateQueries: vi.fn(async () => {}),
  },
}));

vi.mock("@/lib/db", () => ({
  isTauri: vi.fn(() => false),
}));

vi.mock("@/lib/api/token-manager", () => ({
  getToken: vi.fn(() => null),
}));

vi.mock("@/lib/native/widget-bridge", () => ({
  mirrorAuthToken: vi.fn(),
}));

vi.mock("idb-keyval", () => ({
  get: vi.fn(async () => undefined),
  set: vi.fn(async () => undefined),
}));

describe("PIN hashing", () => {
  let db: Database;
  let core: typeof import("@/lib/db/core");
  let pinHash: typeof import("@/lib/utils/pin-hash");
  let useAuth: typeof import("@/lib/context/auth-context").useAuth;
  let AuthProvider: typeof import("@/lib/context/auth-context").AuthProvider;
  let createUser: typeof import("@/lib/db/local-database").createUser;
  let updateUser: typeof import("@/lib/db/local-database").updateUser;

  beforeAll(async () => {
    core = await import("@/lib/db/core");
    pinHash = await import("@/lib/utils/pin-hash");
    const authContext = await import("@/lib/context/auth-context");
    useAuth = authContext.useAuth;
    AuthProvider = authContext.AuthProvider;
    const localDb = await import("@/lib/db/local-database");
    createUser = localDb.createUser;
    updateUser = localDb.updateUser;

    const { SCHEMA_SQL } = await import("@/lib/db/schema");
    const SQL = await initSqlJs({
      locateFile: () => require.resolve("sql.js/dist/sql-wasm.wasm"),
    });
    db = new SQL.Database();
    db.run(SCHEMA_SQL);
    core.__setDatabaseForTesting(db);
  });

  beforeEach(() => {
    db.run(`DELETE FROM users; DELETE FROM _sync_queue;`);
    localStorage.clear();
    sessionStorage.clear();
    core.setCurrentUser(null);
    core.setActiveStoreId(null);
  });

  function wrapper({ children }: { children: React.ReactNode }) {
    return React.createElement(AuthProvider, null, children);
  }

  function seedUser(id: string, username: string, storedPin: string) {
    db.run(
      `INSERT INTO users (id, first_name, last_name, username, pin, role, store_id, is_active, _deleted)
       VALUES (?, 'Test', 'User', ?, ?, 'sales_staff', 'store-a', 1, 0)`,
      [id, username, storedPin],
    );
  }

  function storedPinFor(id: string): string {
    const res = db.exec("SELECT pin FROM users WHERE id = ?", [id]);
    return String(res[0].values[0][0]);
  }

  describe("pin-hash helpers", () => {
    it("verifies a hashed PIN and rejects a wrong one", () => {
      const hash = pinHash.hashPin("1234");
      expect(pinHash.isPinHashed(hash)).toBe(true);
      expect(hash).not.toBe("1234");
      expect(pinHash.pinMatches("1234", hash)).toBe(true);
      expect(pinHash.pinMatches("9999", hash)).toBe(false);
      expect(pinHash.needsPinRehash(hash)).toBe(false);
    });

    it("still verifies a legacy plaintext PIN, and flags it for rehash", () => {
      expect(pinHash.isPinHashed("1234")).toBe(false);
      expect(pinHash.pinMatches("1234", "1234")).toBe(true);
      expect(pinHash.pinMatches("9999", "1234")).toBe(false);
      expect(pinHash.needsPinRehash("1234")).toBe(true);
    });

    it("never double-hashes, and treats a malformed hash as a non-match", () => {
      const hash = pinHash.hashPin("1234");
      expect(pinHash.hashPin(hash)).toBe(hash);
      // What a hash truncated by the old VARCHAR(4) column would look like.
      expect(pinHash.pinMatches("1234", "$2b$")).toBe(false);
      expect(pinHash.pinMatches("1234", null)).toBe(false);
    });

    // The whole design rests on a server-produced hash verifying correctly
    // on-device. Every other test in this file hashes and verifies on the
    // SAME side (bcryptjs both ways), which can't catch a real
    // implementation mismatch - a wrong prefix expectation, a cost-factor
    // incompatibility, a subtly different salt encoding. This literal is a
    // real hash PHP's password_hash(PASSWORD_BCRYPT, ['cost' => 12])
    // produced for the PIN "4321" (Laravel 11's actual bcrypt default is
    // cost 12, not the 10 bcryptjs uses on this side - see the comment on
    // PIN_HASH_ROUNDS in pin-hash.ts for why that doesn't need to match).
    it("verifies a real PHP/Laravel-produced hash, not just one this device made itself", () => {
      const phpHash =
        "$2y$12$TyzhPGK6vhm2/hxOtjOaKeH.io4YTeZXW3a3KCU5GtXqOPM5A/mFa";
      expect(pinHash.isPinHashed(phpHash)).toBe(true);
      expect(pinHash.pinMatches("4321", phpHash)).toBe(true);
      expect(pinHash.pinMatches("0000", phpHash)).toBe(false);
    });
  });

  describe("new PIN writes", () => {
    it("createUser() stores a hash, not the typed digits", async () => {
      const id = await createUser({
        first_name: "New",
        last_name: "Cashier",
        username: "newcashier",
        pin: "4321",
        role: "sales_staff",
        store_id: "store-a",
      } as never);

      const stored = storedPinFor(String(id));
      expect(stored).not.toBe("4321");
      expect(pinHash.isPinHashed(stored)).toBe(true);
      expect(pinHash.pinMatches("4321", stored)).toBe(true);
    });

    it("updateUser() hashes a changed PIN", async () => {
      seedUser("staff-2", "staff2", pinHash.hashPin("1111"));

      await updateUser("staff-2", { pin: "2222" } as never);

      const stored = storedPinFor("staff-2");
      expect(stored).not.toBe("2222");
      expect(pinHash.pinMatches("2222", stored)).toBe(true);
    });
  });

  describe("login", () => {
    it("logs in against an already-hashed PIN", async () => {
      seedUser("staff-3", "staff3", pinHash.hashPin("1357"));

      const { result } = renderHook(() => useAuth(), { wrapper });

      let success = false;
      await act(async () => {
        success = await result.current.login("staff3", "1357");
      });

      expect(success).toBe(true);
    });

    it("rejects a wrong PIN against a hashed value", async () => {
      seedUser("staff-4", "staff4", pinHash.hashPin("1357"));

      const { result } = renderHook(() => useAuth(), { wrapper });

      let success = true;
      await act(async () => {
        success = await result.current.login("staff4", "0000");
      });

      expect(success).toBe(false);
      // Nothing rewritten on a failure.
      expect(pinHash.pinMatches("1357", storedPinFor("staff-4"))).toBe(true);
    });

    it("logs in on a LEGACY plaintext PIN and rewrites it as a hash", async () => {
      seedUser("staff-5", "staff5", "8642");
      expect(storedPinFor("staff-5")).toBe("8642");

      const { result } = renderHook(() => useAuth(), { wrapper });

      let success = false;
      await act(async () => {
        success = await result.current.login("staff5", "8642");
      });

      // The login itself is untouched by the migration - no reset, no prompt.
      expect(success).toBe(true);

      // ...and afterwards the stored PIN is a bcrypt hash of that same PIN.
      await waitFor(() => {
        expect(pinHash.isPinHashed(storedPinFor("staff-5"))).toBe(true);
      });
      const stored = storedPinFor("staff-5");
      expect(stored).not.toBe("8642");
      expect(pinHash.pinMatches("8642", stored)).toBe(true);

      // Queued for sync push like any other local write, which is what
      // carries the hash to the server and on to this account's other
      // devices - no forced reset anywhere in the fleet.
      const queued = db.exec(
        "SELECT payload FROM _sync_queue WHERE table_name = 'users' AND record_id = 'staff-5'",
      );
      expect(queued.length).toBe(1);
      expect(String(queued[0].values[0][0])).toContain(stored);
    });

    it("the migrated user can log in again afterwards", async () => {
      seedUser("staff-6", "staff6", "7531");

      const { result } = renderHook(() => useAuth(), { wrapper });

      await act(async () => {
        await result.current.login("staff6", "7531");
      });
      await waitFor(() => {
        expect(pinHash.isPinHashed(storedPinFor("staff-6"))).toBe(true);
      });

      let success = false;
      await act(async () => {
        success = await result.current.login("staff6", "7531");
      });
      expect(success).toBe(true);
    });

    it("a failed attempt on a legacy plaintext PIN leaves it alone", async () => {
      seedUser("staff-7", "staff7", "1212");

      const { result } = renderHook(() => useAuth(), { wrapper });

      let success = true;
      await act(async () => {
        success = await result.current.login("staff7", "3434");
      });

      expect(success).toBe(false);
      expect(storedPinFor("staff-7")).toBe("1212");
    });
  });
});
