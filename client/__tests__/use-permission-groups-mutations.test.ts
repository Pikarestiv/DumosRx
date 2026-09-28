import { describe, it, expect, beforeAll, beforeEach, vi } from "vitest";
import { renderHook, act, waitFor } from "@testing-library/react";

vi.mock("idb-keyval", () => ({
  get: vi.fn(async () => undefined),
  set: vi.fn(async () => undefined),
}));

import initSqlJs, { type Database } from "sql.js";

/**
 * The standalone delete/revert helpers were already covered, but every
 * mutation the Roles & Permissions matrix actually calls — toggling a single
 * permission on or off, creating, copying and renaming a group — lived in
 * usePermissionGroups' callbacks at 0%. These writes decide what staff can
 * do, so a duplicate-grant bug, a copy that inherits default-group
 * immutability, or a rename that mutates a default group all matter.
 */
describe("usePermissionGroups mutations", () => {
  let db: Database;
  let core: typeof import("@/lib/db/core");
  let usePermissionGroups: typeof import("@/lib/hooks/use-permission-groups").usePermissionGroups;

  beforeAll(async () => {
    core = await import("@/lib/db/core");
    ({ usePermissionGroups } = await import("@/lib/hooks/use-permission-groups"));

    const { SCHEMA_SQL } = await import("@/lib/db/schema");
    const SQL = await initSqlJs({
      locateFile: () => require.resolve("sql.js/dist/sql-wasm.wasm"),
    });
    db = new SQL.Database();
    db.run(SCHEMA_SQL);
    const { runSchemaMigrations, makeSqlJsAdapter } = await import(
      "@/lib/db/schema-migrations"
    );
    await runSchemaMigrations(makeSqlJsAdapter(db));
    core.__setDatabaseForTesting(db);
  });

  beforeEach(() => {
    db.run(`DELETE FROM permission_groups; DELETE FROM users; DELETE FROM audit_logs;`);
    core.setActiveStoreId("store-a");
  });

  function seedGroup(
    id: string,
    name: string,
    opts: { role?: string; isDefault?: number; permissions?: string[]; storeId?: string } = {},
  ) {
    db.run(
      `INSERT INTO permission_groups (id, store_id, name, based_on_role, is_default, permissions, _deleted)
       VALUES (?, ?, ?, ?, ?, ?, 0)`,
      [
        id,
        opts.storeId ?? "store-a",
        name,
        opts.role ?? "manager",
        opts.isDefault ?? 0,
        JSON.stringify(opts.permissions ?? []),

      ],
    );
  }

  function rawPermissions(id: string): string {
    const rows = db.exec(`SELECT permissions FROM permission_groups WHERE id = ?`, [id]);
    return rows[0].values[0][0] as string;
  }

  async function mount() {
    const { result } = renderHook(() => usePermissionGroups());
    await waitFor(() => expect(result.current.groups.length).toBeGreaterThan(0));
    return result;
  }

  it("loads the active store's groups with their permissions parsed", async () => {
    seedGroup("g1", "Custom", { permissions: ["pos.sell"] });
    const result = await mount();
    expect(result.current.groups[0]).toMatchObject({
      id: "g1",
      name: "Custom",
      permissions: ["pos.sell"],
    });
  });

  it("grants a permission by adding it to the group's set", async () => {
    seedGroup("g1", "Custom", { permissions: ["pos.sell"] });
    const result = await mount();

    await act(async () => {
      await result.current.toggle("g1", "inventory.edit", true);
    });

    expect(JSON.parse(rawPermissions("g1")).sort()).toEqual([
      "inventory.edit",
      "pos.sell",
    ]);
  });

  it("never records a duplicate when granting a permission the group already has", async () => {
    seedGroup("g1", "Custom", { permissions: ["pos.sell"] });
    const result = await mount();

    await act(async () => {
      await result.current.toggle("g1", "pos.sell", true);
    });

    expect(JSON.parse(rawPermissions("g1"))).toEqual(["pos.sell"]);
  });

  it("revokes a permission, leaving the group's others in place", async () => {
    seedGroup("g1", "Custom", { permissions: ["pos.sell", "inventory.edit"] });
    const result = await mount();

    await act(async () => {
      await result.current.toggle("g1", "pos.sell", false);
    });

    expect(JSON.parse(rawPermissions("g1"))).toEqual(["inventory.edit"]);
  });

  it("revoking a permission the group never had changes nothing", async () => {
    seedGroup("g1", "Custom", { permissions: ["pos.sell"] });
    const result = await mount();

    await act(async () => {
      await result.current.toggle("g1", "reports.view", false);
    });

    expect(JSON.parse(rawPermissions("g1"))).toEqual(["pos.sell"]);
  });

  it("ignores a toggle aimed at a group that isn't loaded", async () => {
    seedGroup("g1", "Custom", { permissions: ["pos.sell"] });
    seedGroup("g2", "Other store", { storeId: "store-b", permissions: ["pos.sell"] });
    const result = await mount();

    await act(async () => {
      await result.current.toggle("g2", "inventory.edit", true);
    });

    expect(JSON.parse(rawPermissions("g2"))).toEqual(["pos.sell"]);
  });

  it("creates a custom group that starts with no permissions at all", async () => {
    seedGroup("g1", "Seed");
    const result = await mount();

    await act(async () => {
      await result.current.createGroup("Night Shift", "sales_staff");
    });

    const rows = db.exec(
      `SELECT based_on_role, is_default, permissions FROM permission_groups WHERE name = 'Night Shift'`,
    );
    expect(rows[0].values[0]).toEqual(["sales_staff", 0, "[]"]);
  });

  it("copies a group's permissions and role but never its default status", async () => {
    seedGroup("g1", "Manager", {
      role: "manager",
      isDefault: 1,
      permissions: ["pos.sell", "reports.view"],
    });
    const result = await mount();

    await act(async () => {
      await result.current.copyGroup("g1", "Manager (copy)");
    });

    const rows = db.exec(
      `SELECT based_on_role, is_default, permissions FROM permission_groups WHERE name = 'Manager (copy)'`,
    );
    const [role, isDefault, permissions] = rows[0].values[0];
    expect(role).toBe("manager");
    expect(isDefault).toBe(0);
    expect(JSON.parse(permissions as string)).toEqual(["pos.sell", "reports.view"]);
  });

  it("copies nothing when the source group isn't loaded", async () => {
    seedGroup("g1", "Custom");
    const result = await mount();

    await act(async () => {
      await result.current.copyGroup("nope", "Ghost");
    });

    const rows = db.exec(`SELECT COUNT(*) FROM permission_groups`);
    expect(rows[0].values[0][0]).toBe(1);
  });

  it("renames a custom group", async () => {
    seedGroup("g1", "Old Name");
    const result = await mount();

    await act(async () => {
      await result.current.renameGroup("g1", "New Name");
    });

    const rows = db.exec(`SELECT name FROM permission_groups WHERE id = 'g1'`);
    expect(rows[0].values[0][0]).toBe("New Name");
  });

  it("refuses to rename a default group, which is immutable by name", async () => {
    seedGroup("g1", "Manager", { isDefault: 1 });
    const result = await mount();

    await act(async () => {
      await result.current.renameGroup("g1", "Supervisors");
    });

    const rows = db.exec(`SELECT name FROM permission_groups WHERE id = 'g1'`);
    expect(rows[0].values[0][0]).toBe("Manager");
  });

  it("deletes a custom group with nobody assigned and drops it from the loaded list", async () => {
    seedGroup("g1", "Keep");
    seedGroup("g2", "Drop");
    const result = await mount();

    await act(async () => {
      await result.current.deleteGroup("g2");
    });

    expect(result.current.groups.map((g) => g.id)).toEqual(["g1"]);
  });

  it("surfaces the refusal when deleting a group that still has staff assigned", async () => {
    seedGroup("g1", "Staffed");
    db.run(
      `INSERT INTO users (id, first_name, pin, role, store_id, permission_group_id, is_active)
       VALUES ('u1', 'Ada', 'x', 'manager', 'store-a', 'g1', 1)`,
    );
    const result = await mount();

    let caught: unknown;
    await act(async () => {
      try {
        await result.current.deleteGroup("g1");
      } catch (e) {
        caught = e;
      }
    });

    expect((caught as Error).message).toMatch(/staff assigned/i);
    expect(result.current.groups.map((g) => g.id)).toEqual(["g1"]);
  });

  it("reverting a default group restores its seeded permission set", async () => {
    const { DEFAULT_GROUP_PERMISSIONS } = await import("@/lib/constants/permissions");
    seedGroup("g1", "Manager", {
      role: "manager",
      isDefault: 1,
      permissions: ["pos.sell"],
    });
    const result = await mount();

    await act(async () => {
      await result.current.revertToDefault("g1");
    });

    expect(JSON.parse(rawPermissions("g1"))).toEqual(
      DEFAULT_GROUP_PERMISSIONS.manager,
    );
  });

  it("reverting a custom group leaves its permissions as the owner set them", async () => {
    seedGroup("g1", "Custom", { role: "manager", permissions: ["pos.sell"] });
    const result = await mount();

    await act(async () => {
      await result.current.revertToDefault("g1");
    });

    expect(JSON.parse(rawPermissions("g1"))).toEqual(["pos.sell"]);
  });
});
