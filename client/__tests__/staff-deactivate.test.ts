import { describe, it, expect, beforeAll, beforeEach, vi } from "vitest";
import initSqlJs, { type Database } from "sql.js";
import { hashPin } from "@/lib/utils/pin-hash";

vi.mock("idb-keyval", () => ({
  get: vi.fn(() => Promise.resolve(undefined)),
  set: vi.fn(() => Promise.resolve(undefined)),
}));

describe("Staff deactivation and reactivation lifecycle", () => {
  let db: Database;
  let core: typeof import("@/lib/db/core");
  let updateUser: typeof import("@/lib/db/local-database").updateUser;
  let getUsersByUsernameOrEmail: typeof import("@/lib/db/queries/auth").getUsersByUsernameOrEmail;
  let getUserByUsernameOrEmail: typeof import("@/lib/db/queries/auth").getUserByUsernameOrEmail;

  beforeAll(async () => {
    core = await import("@/lib/db/core");
    ({ updateUser } = await import("@/lib/db/local-database"));
    ({ getUsersByUsernameOrEmail, getUserByUsernameOrEmail } = await import("@/lib/db/queries/auth"));

    const { SCHEMA_SQL } = await import("@/lib/db/schema");
    const SQL = await initSqlJs({
      locateFile: () => require.resolve("sql.js/dist/sql-wasm.wasm"),
    });
    db = new SQL.Database();
    db.run(SCHEMA_SQL);
    core.__setDatabaseForTesting(db);
  });

  beforeEach(() => {
    db.run(`DELETE FROM sales; DELETE FROM sale_items; DELETE FROM users; DELETE FROM _sync_queue;`);
    core.setActiveStoreId(null);
  });

  function seedStaff(overrides: { id?: string; username?: string; email?: string; isActive?: number } = {}) {
    const id = overrides.id ?? "staff-1";
    const username = overrides.username ?? "cashier1";
    const email = overrides.email ?? "cashier1@shop.com";
    const isActive = overrides.isActive ?? 1;
    const pin = hashPin("1234");

    db.run(
      `INSERT INTO users (id, first_name, last_name, username, email, pin, role, is_active, _deleted, created_at, updated_at)
       VALUES (?, 'Ada', 'Lovelace', ?, ?, ?, 'sales_staff', ?, 0, '2026-11-01', '2026-11-01')`,
      [id, username, email, pin, isActive],
    );
  }

  it("deactivating a staff member sets is_active = 0 while preserving the user record without soft-deleting", async () => {
    seedStaff({ id: "u1", username: "ada_cashier", isActive: 1 });

    await updateUser("u1", { is_active: 0 });

    const rows = db.exec("SELECT is_active, _deleted, username, email FROM users WHERE id = 'u1'")[0]?.values ?? [];
    expect(rows).toHaveLength(1);
    expect(rows[0][0]).toBe(0);
    expect(rows[0][1]).toBe(0);
    expect(rows[0][2]).toBe("ada_cashier");
    expect(rows[0][3]).toBe("cashier1@shop.com");
  });

  it("inactive staff cannot authenticate or be looked up at the till", async () => {
    seedStaff({ id: "u2", username: "till_user", email: "till@shop.com", isActive: 1 });

    const beforeDeactivation = await getUserByUsernameOrEmail("till_user");
    expect(beforeDeactivation).not.toBeNull();
    expect(beforeDeactivation?.id).toBe("u2");

    await updateUser("u2", { is_active: 0 });

    const afterDeactivation = await getUserByUsernameOrEmail("till_user");
    expect(afterDeactivation).toBeNull();

    const candidates = await getUsersByUsernameOrEmail("till_user");
    expect(candidates).toHaveLength(0);

    const emailCandidates = await getUsersByUsernameOrEmail("till@shop.com");
    expect(emailCandidates).toHaveLength(0);
  });

  it("reactivating a staff member restores is_active = 1 and permits till authentication", async () => {
    seedStaff({ id: "u3", username: "returning_staff", isActive: 0 });

    expect(await getUserByUsernameOrEmail("returning_staff")).toBeNull();

    await updateUser("u3", { is_active: 1 });

    const rows = db.exec("SELECT is_active, _deleted FROM users WHERE id = 'u3'")[0]?.values ?? [];
    expect(rows[0][0]).toBe(1);
    expect(rows[0][1]).toBe(0);

    const activeUser = await getUserByUsernameOrEmail("returning_staff");
    expect(activeUser).not.toBeNull();
    expect(activeUser?.id).toBe("u3");
  });

  it("historical transaction attribution remains linked to the deactivated staff member", async () => {
    seedStaff({ id: "u4", username: "audit_cashier", isActive: 1 });

    db.run(
      `INSERT INTO sales (id, transaction_number, subtotal, total_amount, payment_method, user_id, _deleted)
       VALUES ('sale-hist-1', 'TXN-001', 5000, 5000, 'cash', 'u4', 0)`,
    );

    await updateUser("u4", { is_active: 0 });

    const rows = db.exec(
      `SELECT s.id, s.total_amount, u.first_name, u.last_name, u.is_active
       FROM sales s
       JOIN users u ON s.user_id = u.id
       WHERE s.id = 'sale-hist-1'`,
    )[0]?.values ?? [];

    expect(rows).toHaveLength(1);
    expect(rows[0][0]).toBe("sale-hist-1");
    expect(rows[0][1]).toBe(5000);
    expect(rows[0][2]).toBe("Ada");
    expect(rows[0][3]).toBe("Lovelace");
    expect(rows[0][4]).toBe(0);
  });
});
