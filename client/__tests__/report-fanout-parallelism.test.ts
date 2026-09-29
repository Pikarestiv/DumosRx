import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

/**
 * getDashboardOverviewData and getBIMetrics each fan out to a dozen-plus
 * independent reads. Awaiting them one at a time serialises the whole
 * dashboard behind the slowest possible ordering, so these pin that the
 * independent reads are actually issued together: every statement must be in
 * flight before the first one is allowed to resolve.
 */

const pending: { resolve: () => void }[] = [];
let issued = 0;

const mockQuery = vi.fn(() => {
  issued += 1;
  return new Promise((resolve) => {
    pending.push({ resolve: () => resolve([]) });
  });
});

// Two of getDashboardOverviewData's/getBIMetrics's reads go through
// lib/db/queries/finance.ts (getSmoothedExpensesTotal/getSmoothedAmountInWindow),
// which imports `query` from "@/lib/db/local-database" directly, not from
// "@/lib/db" - mocking only the latter leaves that path pointed at the real
// query(), which lazily boots a genuine sql.js instance with core.ts's
// browser-only locateFile default. Whether that surfaces as a failure
// depends only on whether some earlier, unrelated test already "warmed" the
// wasm loader's own module-level cache in this worker - i.e. a real bug in
// this file's own mock coverage that only *looked* like unrelated ambient
// flakiness. Both specifiers resolve to the exact same underlying function
// (local-database.ts re-exports core.ts's query verbatim), so both need
// mocking here.
vi.mock("@/lib/db", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/db")>();
  return { ...actual, query: mockQuery };
});

vi.mock("@/lib/db/local-database", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/db/local-database")>();
  return { ...actual, query: mockQuery };
});

vi.mock("idb-keyval", () => ({
  get: vi.fn(async () => undefined),
  set: vi.fn(async () => undefined),
}));

/** Lets the microtask queue drain so every already-issued query has had the
 * chance to fire before we look at how many are in flight. */
async function settleMicrotasks() {
  for (let i = 0; i < 50; i += 1) await Promise.resolve();
}

/** Resolves every pending query, including ones a resolved query's own
 * continuation issues afterward (getSmoothedExpensesTotal awaits its
 * per-installment getSmoothedAmountInWindow query and only then issues the
 * next one, rather than firing every installment up front) - a single
 * resolve-everything-once pass would leave that second wave hanging
 * forever. Bounded so a genuine bug here fails fast instead of hanging the
 * suite. */
async function drainAllPending() {
  for (let round = 0; round < 50 && pending.length > 0; round += 1) {
    const batch = pending.splice(0, pending.length);
    batch.forEach((p) => p.resolve());
    await settleMicrotasks();
  }
}

describe("report fan-out parallelism", () => {
  beforeEach(() => {
    pending.length = 0;
    issued = 0;
  });

  afterEach(async () => {
    // Nothing should be left hanging between cases.
    await drainAllPending();
  });

  it("issues getDashboardOverviewData's independent reads concurrently", async () => {
    const { getDashboardOverviewData } = await import("@/lib/db/queries/reports");

    const inFlight = getDashboardOverviewData();
    await settleMicrotasks();

    // Sequential awaits would leave exactly one query in flight here.
    expect(issued).toBeGreaterThanOrEqual(10);

    await drainAllPending();
    await inFlight;
  });

  it("issues getBIMetrics's independent reads concurrently", async () => {
    const { getBIMetrics } = await import("@/lib/db/queries/reports");

    const inFlight = getBIMetrics("2026-01-01", "2025-12-01", undefined, "2026-01-31");
    await settleMicrotasks();

    expect(issued).toBeGreaterThanOrEqual(15);

    await drainAllPending();
    await inFlight;
  });
});
