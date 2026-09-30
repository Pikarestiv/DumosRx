import { describe, it, expect, beforeAll, beforeEach } from "vitest";
import initSqlJs, { type Database } from "sql.js";
import type { ToolContext } from "@/lib/assistant/types";

describe("assistant sales tools", () => {
  let db: Database;
  let core: typeof import("@/lib/db/core");
  let mySalesTodayTool: typeof import("@/lib/assistant/tools/sales-tools").mySalesTodayTool;
  let toDateOnly: typeof import("@/lib/assistant/date-phrases").toDateOnly;

  beforeAll(async () => {
    core = await import("@/lib/db/core");
    mySalesTodayTool = (await import("@/lib/assistant/tools/sales-tools")).mySalesTodayTool;
    toDateOnly = (await import("@/lib/assistant/date-phrases")).toDateOnly;

    const { SCHEMA_SQL } = await import("@/lib/db/schema");
    const SQL = await initSqlJs({
      locateFile: () => require.resolve("sql.js/dist/sql-wasm.wasm"),
    });
    db = new SQL.Database();
    db.run(SCHEMA_SQL);
    core.__setDatabaseForTesting(db);
  });

  beforeEach(() => {
    db.run(`DELETE FROM sales; DELETE FROM returns;`);
    core.setActiveStoreId(null);
  });

  const now = new Date();

  const baseCtx: ToolContext = {
    user: { id: "cashier1", role: "sales_staff" },
    permissionGroup: { permissions: ["process_sales"] },
    currencyCode: "NGN",
    expiryWarningDays: 90,
    storeType: "pharmacy",
    t: (k: string) => k,
    now,
  };

  function insertSale(id: string, userId: string, totalAmount: number, createdAt: string) {
    db.run(
      `INSERT INTO sales (id, transaction_number, user_id, subtotal, total_amount, created_at, _deleted)
       VALUES (?, ?, ?, ?, ?, ?, 0)`,
      [id, `TXN-${id}`, userId, totalAmount, totalAmount, createdAt],
    );
  }

  function localNoon(dateOnly: string): string {
    const [year, month, day] = dateOnly.split("-").map(Number);
    return new Date(year, month - 1, day, 12, 0, 0, 0).toISOString();
  }

  it("counts only the signed-in cashier's own sales for today", async () => {
    const today = toDateOnly(now);
    const yesterday = toDateOnly(new Date(now.getFullYear(), now.getMonth(), now.getDate() - 1));

    insertSale("s1", "cashier1", 100, localNoon(today));
    insertSale("s2", "cashier2", 200, localNoon(today));
    insertSale("s3", "cashier1", 400, localNoon(yesterday));

    const result = await mySalesTodayTool.execute({}, baseCtx);
    expect(result.count).toBe(1);
    expect(result.netTotal).toBe(100);
  });

  it("nets out refunds against the cashier's own sales", async () => {
    const today = toDateOnly(now);
    insertSale("s1", "cashier1", 100, localNoon(today));
    insertSale("s2", "cashier1", 50, localNoon(today));
    db.run(
      `INSERT INTO returns (id, sale_id, user_id, total_refunded, created_at, _deleted)
       VALUES ('r1', 's1', 'cashier1', 30, ?, 0)`,
      [localNoon(today)],
    );

    const result = await mySalesTodayTool.execute({}, baseCtx);
    expect(result.count).toBe(2);
    expect(result.netTotal).toBe(120);
  });

  it("reports the count and the net total in its reply", async () => {
    const reply = mySalesTodayTool.format({ count: 2, netTotal: 120 }, {}, baseCtx);
    expect(reply.kind).toBe("answer");
    expect(reply.text).toContain("2");
    expect(reply.text).toContain("120");
  });
});
