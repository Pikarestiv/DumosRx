import { describe, it, expect, beforeAll, beforeEach, vi } from "vitest";
import initSqlJs, { type Database } from "sql.js";

vi.mock("idb-keyval", () => ({
  get: vi.fn(async () => undefined),
  set: vi.fn(async () => undefined),
}));

/**
 * getUserPermissionGroup returned null for BOTH "no group assigned" and
 * "malformed JSON in permissions", and hasPermission's fallback
 * (`group?.permissions ?? fallbackPermissions(role)`) then granted the full
 * ROLE-TIER defaults for a corrupt row - a silent privilege reversion to
 * pre-feature behavior where a safe deny was wanted.
 *
 * The two cases are distinguishable, so conflating them was never necessary:
 * fallbackPermissions exists for the offline/pre-sync gap, where NO row exists
 * yet (see its own doc comment). A malformed row is the opposite situation - the
 * row did sync, it is just corrupt - so it now denies instead, matching what
 * getStorePermissionGroups already did for the same corruption.
 *
 * A store_owner/super_admin still can't be locked out: hasPermission
 * short-circuits to "everything granted" for those roles before any group is
 * consulted.
 */
describe("getUserPermissionGroup with a malformed permissions column", () => {
  let db: Database;
  let core: typeof import("@/lib/db/core");
  let getUserPermissionGroup: typeof import("@/lib/db/queries/permission-groups").getUserPermissionGroup;
  let hasPermission: typeof import("@/lib/hooks/use-permissions").hasPermission;

  beforeAll(async () => {
    core = await import("@/lib/db/core");
    ({ getUserPermissionGroup } = await import("@/lib/db/queries/permission-groups"));
    ({ hasPermission } = await import("@/lib/hooks/use-permissions"));
    const { SCHEMA_SQL } = await import("@/lib/db/schema");
    const SQL = await initSqlJs({ locateFile: () => require.resolve("sql.js/dist/sql-wasm.wasm") });
    db = new SQL.Database();
    db.run(SCHEMA_SQL);
    core.__setDatabaseForTesting(db);
  });

  beforeEach(() => {
    db.run(`DELETE FROM permission_groups; DELETE FROM stores; DELETE FROM users;`);
    db.run(`INSERT INTO stores (id) VALUES ('store1')`);
    core.setActiveStoreId("store1");
  });

  function seedUserWithGroupPermissions(rawPermissions: string) {
    db.run(`INSERT INTO users (id, role, first_name, last_name) VALUES ('u1', 'manager', 'T', 'U')`);
    db.run(
      `INSERT INTO permission_groups (id, store_id, name, based_on_role, is_default, permissions)
       VALUES ('pg1', 'store1', 'Corrupted', 'manager', 0, ?)`,
      [rawPermissions],
    );
    db.run(`UPDATE users SET permission_group_id = 'pg1' WHERE id = 'u1'`);
  }

  it("returns an explicit empty-permissions group, not null, so a corrupt row denies", async () => {
    seedUserWithGroupPermissions("not valid json{{");

    const group = await getUserPermissionGroup("u1");

    expect(group).not.toBeNull();
    expect(group!.id).toBe("pg1");
    expect(group!.permissions).toEqual([]);

    // The behaviour that actually matters: a manager's role-tier defaults are
    // NOT silently restored by the corruption.
    const user = { role: "manager" };
    expect(hasPermission(user, group, "process_sales")).toBe(false);
    expect(hasPermission(user, group, "manage_products")).toBe(false);
  });

  it("still returns null when the user genuinely has no group, preserving the pre-sync role fallback", async () => {
    db.run(`INSERT INTO users (id, role, first_name, last_name) VALUES ('u2', 'manager', 'T', 'U')`);

    const group = await getUserPermissionGroup("u2");

    expect(group).toBeNull();
    // The offline/pre-sync gap must still grant the role tier, or a brand-new
    // device would be locked out before its first sync.
    expect(hasPermission({ role: "manager" }, group, "process_sales")).toBe(true);
  });

  it("still parses a well-formed row normally", async () => {
    seedUserWithGroupPermissions('["process_sales"]');

    const group = await getUserPermissionGroup("u1");

    expect(group!.permissions).toEqual(["process_sales"]);
    // A-55: the group carries the id of the user it was read for, so
    // hasPermission can refuse to apply it to anybody else.
    expect(group!.userId).toBe("u1");
    expect(hasPermission({ role: "manager" }, group, "process_sales")).toBe(true);
    expect(hasPermission({ role: "manager" }, group, "manage_products")).toBe(false);
  });

  it("never locks out a store_owner, whatever the row says", async () => {
    seedUserWithGroupPermissions("not valid json{{");
    db.run(`UPDATE users SET role = 'store_owner' WHERE id = 'u1'`);

    const group = await getUserPermissionGroup("u1");

    expect(hasPermission({ role: "store_owner" }, group, "manage_staff")).toBe(true);
  });
});
