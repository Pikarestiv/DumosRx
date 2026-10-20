import { describe, it, expect, beforeEach, vi } from "vitest";

vi.mock("idb-keyval", () => ({
  get: vi.fn(async () => undefined),
  set: vi.fn(async () => undefined),
}));

// Regression test for a real, reproduced-in-production-testing bug:
// Rationale: docs/CLIENT_COMMENTS.md#block-__tests__-query-retries-on-statement-closed-test-ts-L8
describe("query() retries once on a Statement-closed error", () => {
  let core: typeof import("@/lib/db/core");

  beforeEach(async () => {
    vi.resetModules();
    core = await import("@/lib/db/core");
  });

  function makeStatement(rows: Record<string, unknown>[], failOnStep: boolean) {
    let index = 0;
    let freed = false;
    return {
      bind: vi.fn(),
      step: vi.fn(() => {
        if (failOnStep) throw new Error("Statement closed");
        if (index < rows.length) return true;
        return false;
      }),
      getAsObject: vi.fn(() => rows[index++]),
      free: vi.fn(() => {
        freed = true;
      }),
      get _freed() {
        return freed;
      },
    };
  }

  it("discards the failed statement and succeeds against a freshly-prepared one", async () => {
    const failingStmt = makeStatement([], true);
    const workingStmt = makeStatement([{ id: "row-1" }], false);
    const prepare = vi
      .fn()
      .mockReturnValueOnce(failingStmt)
      .mockReturnValueOnce(workingStmt);

    core.__setDatabaseForTesting({ prepare });

    const rows = await core.query("SELECT * FROM products");

    expect(rows).toEqual([{ id: "row-1" }]);
    expect(prepare).toHaveBeenCalledTimes(2);
    expect(failingStmt.free).toHaveBeenCalled();
  });

  it("retries a second time after two consecutive failures, instead of giving up after just one", async () => {
    const failingStmt1 = makeStatement([], true);
    const failingStmt2 = makeStatement([], true);
    const workingStmt = makeStatement([{ id: "row-1" }], false);
    const prepare = vi
      .fn()
      .mockReturnValueOnce(failingStmt1)
      .mockReturnValueOnce(failingStmt2)
      .mockReturnValueOnce(workingStmt);

    core.__setDatabaseForTesting({ prepare });

    const rows = await core.query("SELECT * FROM products");

    expect(rows).toEqual([{ id: "row-1" }]);
    expect(prepare).toHaveBeenCalledTimes(3);
  });

  it("still throws if both retries also fail (doesn't loop forever)", async () => {
    const failingStmt1 = makeStatement([], true);
    const failingStmt2 = makeStatement([], true);
    const failingStmt3 = makeStatement([], true);
    const prepare = vi
      .fn()
      .mockReturnValueOnce(failingStmt1)
      .mockReturnValueOnce(failingStmt2)
      .mockReturnValueOnce(failingStmt3);

    core.__setDatabaseForTesting({ prepare });

    await expect(core.query("SELECT * FROM products")).rejects.toThrow(
      "Statement closed",
    );
    expect(prepare).toHaveBeenCalledTimes(3);
  });

  it("retries sql.js's own SQLITE_MISUSE wording the same way, not just 'closed'/'finalized'", async () => {
    const failingStmt = makeStatement([], true);
    failingStmt.step = vi.fn(() => {
      throw new Error("bad parameter or other API misuse");
    });
    const workingStmt = makeStatement([{ id: "row-1" }], false);
    const prepare = vi
      .fn()
      .mockReturnValueOnce(failingStmt)
      .mockReturnValueOnce(workingStmt);

    core.__setDatabaseForTesting({ prepare });

    const rows = await core.query("SELECT * FROM products");

    expect(rows).toEqual([{ id: "row-1" }]);
  });

  it("does not retry a genuinely different error", async () => {
    const badSqlStmt = makeStatement([], false);
    badSqlStmt.step = vi.fn(() => {
      throw new Error("no such table: nonexistent");
    });
    const prepare = vi.fn().mockReturnValueOnce(badSqlStmt);

    core.__setDatabaseForTesting({ prepare });

    await expect(core.query("SELECT * FROM nonexistent")).rejects.toThrow(
      "no such table",
    );
    expect(prepare).toHaveBeenCalledTimes(1);
  });
});
