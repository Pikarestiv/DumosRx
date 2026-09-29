import { describe, it, expect, beforeAll, beforeEach, vi } from "vitest";
import initSqlJs, { type Database } from "sql.js";

vi.mock("idb-keyval", () => ({
  get: vi.fn(async () => undefined),
  set: vi.fn(async () => undefined),
}));

/**
 * Automatic crash reports land in the same `feedback` table as
 * user-submitted feedback, but they are background telemetry: they must not
 * be advertised to the user as "X changes unsynced", and they must not earn
 * an instant sync of their own. They must still ride along with any sync
 * that happens for another reason.
 */
describe("crash reports and the unsynced-changes count", () => {
  let db: Database;
  let core: typeof import("@/lib/db/core");
  let insert: typeof import("@/lib/db/base-helpers").insert;
  let getSyncQueueCount: typeof import("@/lib/db/queries/setup").getSyncQueueCount;
  let getSyncQueueBreakdown: typeof import("@/lib/db/queries/setup").getSyncQueueBreakdown;
  let getPendingSyncItems: typeof import("@/lib/db/base-helpers").getPendingSyncItems;
  let hasPendingNonCrashFeedback: typeof import("@/lib/db/crash-report-sync").hasPendingNonCrashFeedback;

  const crashReport = (id: string) => ({
    id,
    user_id: "anonymous",
    type: "bug",
    content: "[CRASH] boom",
    status: "pending",
    fingerprint: `fp-${id}`,
    occurrence_count: 1,
    created_at: new Date().toISOString(),
  });

  const userFeedback = (id: string, type = "feature_request") => ({
    id,
    user_id: "user-1",
    type,
    content: "Please add dark mode",
    contact_email: "user@example.com",
    status: "pending",
    created_at: new Date().toISOString(),
  });

  beforeAll(async () => {
    core = await import("@/lib/db/core");
    ({ insert, getPendingSyncItems } = await import("@/lib/db/base-helpers"));
    ({ getSyncQueueCount, getSyncQueueBreakdown } = await import(
      "@/lib/db/queries/setup"
    ));
    ({ hasPendingNonCrashFeedback } = await import(
      "@/lib/db/crash-report-sync"
    ));

    const { SCHEMA_SQL } = await import("@/lib/db/schema");
    const SQL = await initSqlJs({
      locateFile: () => require.resolve("sql.js/dist/sql-wasm.wasm"),
    });
    db = new SQL.Database();
    db.run(SCHEMA_SQL);
    core.__setDatabaseForTesting(db);
  });

  beforeEach(() => {
    db.run(
      `DELETE FROM feedback; DELETE FROM _sync_queue; DELETE FROM audit_logs; DELETE FROM products;`,
    );
  });

  it("does not count a pending crash report as an unsynced change", async () => {
    await insert("feedback", crashReport("crash-1"));

    expect(await getSyncQueueCount()).toBe(0);
  });

  it("still counts user-submitted feedback as an unsynced change", async () => {
    await insert("feedback", userFeedback("fb-1"));

    expect(await getSyncQueueCount()).toBe(1);
  });

  it("counts user-typed bug reports, which carry no fingerprint", async () => {
    await insert("feedback", userFeedback("fb-2", "bug"));

    expect(await getSyncQueueCount()).toBe(1);
  });

  it("counts everything else normally alongside an excluded crash report", async () => {
    await insert("products", { id: "p-1", name: "Paracetamol" });
    await insert("feedback", crashReport("crash-2"));
    await insert("feedback", userFeedback("fb-3"));

    const total = await core.query<{ count: number }>(
      "SELECT COUNT(*) as count FROM _sync_queue",
    );
    expect(total[0].count).toBe(4);
    expect(await getSyncQueueCount()).toBe(3);
  });

  it("excludes a crash report's follow-up UPDATE rows too, not just its INSERT", async () => {
    await insert("feedback", crashReport("crash-3"));
    const { update } = await import("@/lib/db/base-helpers");
    await update("feedback", "crash-3", {
      content: "[CRASH] boom\n\n(Repeated 2 times)",
      occurrence_count: 2,
    });

    expect(await getSyncQueueCount()).toBe(0);
  });

  it("still pushes crash reports: they stay in the queue for any sync that runs", async () => {
    await insert("feedback", crashReport("crash-4"));

    const pending = await getPendingSyncItems();
    expect(pending.map((i) => i.record_id)).toContain("crash-4");
  });

  it("keeps showing crash rows in the diagnostic queue breakdown", async () => {
    await insert("feedback", crashReport("crash-5"));

    const breakdown = await getSyncQueueBreakdown();
    expect(breakdown.some((b) => b.table_name === "feedback")).toBe(true);
  });

  it("reports no trigger-worthy feedback when only crash reports are pending", async () => {
    await insert("feedback", crashReport("crash-6"));

    expect(await hasPendingNonCrashFeedback()).toBe(false);
  });

  it("reports trigger-worthy feedback when the user submitted some", async () => {
    await insert("feedback", crashReport("crash-7"));
    await insert("feedback", userFeedback("fb-4"));

    expect(await hasPendingNonCrashFeedback()).toBe(true);
  });
});
