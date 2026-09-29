import { describe, it, expect, beforeAll } from "vitest";
import initSqlJs, { type Database } from "sql.js";

describe("permission_groups schema", () => {
  let db: Database;

  beforeAll(async () => {
    const { SCHEMA_SQL } = await import("@/lib/db/schema");
    const SQL = await initSqlJs({
      locateFile: () => require.resolve("sql.js/dist/sql-wasm.wasm"),
    });
    db = new SQL.Database();
    db.run(SCHEMA_SQL);
  });

  it("creates permission_groups with the expected columns", () => {
    db.run(
      `INSERT INTO permission_groups (id, store_id, name, based_on_role, is_default, permissions, created_at)
       VALUES ('pg1', 'store1', 'Manager', 'manager', 1, '["process_sales"]', '2026-01-01')`,
    );
    const result = db.exec("SELECT * FROM permission_groups WHERE id = 'pg1'");
    expect(result[0].values[0]).toContain("Manager");
  });

  it("users has a permission_group_id column", () => {
    db.run(`INSERT INTO users (id, role) VALUES ('u1', 'manager')`);
    expect(() =>
      db.run(`UPDATE users SET permission_group_id = 'pg1' WHERE id = 'u1'`),
    ).not.toThrow();
  });

  it("stores has a permission_groups_seeded_at column", () => {
    db.run(`INSERT INTO stores (id) VALUES ('store1')`);
    expect(() =>
      db.run(`UPDATE stores SET permission_groups_seeded_at = '2026-01-01' WHERE id = 'store1'`),
    ).not.toThrow();
  });
});
