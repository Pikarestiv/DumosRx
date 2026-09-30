import { describe, it, expect } from "vitest";

/**
 * A-58: `npm run test:schema` compared client `audit_logs` against a
 * vestigial MySQL `audit_logs` table instead of the real sync target
 * `activity_logs` (SyncController's `'audit_logs' => ActivityLog::class`),
 * and its column parser lost every column that followed an inline `--`
 * comment in SCHEMA_SQL (e.g. `loyalty_transactions.transaction_id`).
 */
describe("verify-schema-sync parsing", () => {
  it("maps client table names onto the server tables the sync engine really writes", async () => {
    const { serverTableFor } = await import("@/scripts/verify-schema-sync");
    expect(serverTableFor("audit_logs")).toBe("activity_logs");
    expect(serverTableFor("products")).toBe("products");
  });

  it("does not lose a column that follows an inline -- comment", async () => {
    const { parseSQLiteSchema } = await import("@/scripts/verify-schema-sync");
    const sql = `
CREATE TABLE IF NOT EXISTS loyalty_transactions (
  id TEXT PRIMARY KEY,
  customer_id TEXT NOT NULL,
  points REAL NOT NULL,
  type TEXT NOT NULL, -- 'earned', 'redeemed'
  transaction_id TEXT,
  created_at TEXT
);
`;
    const columns = parseSQLiteSchema(sql).loyalty_transactions;
    expect(columns).toContain("transaction_id");
    expect(columns).toContain("created_at");
    expect(columns).not.toContain("'earned'");
    expect(columns).not.toContain("'redeemed'");
  });

  it("parses the real SCHEMA_SQL without dropping loyalty_transactions.transaction_id", async () => {
    const { parseSQLiteSchema } = await import("@/scripts/verify-schema-sync");
    const { SCHEMA_SQL } = await import("@/lib/db/schema");
    const tables = parseSQLiteSchema(SCHEMA_SQL);
    expect(tables.loyalty_transactions).toContain("transaction_id");
    expect(tables.audit_logs).toBeDefined();
  });
});
