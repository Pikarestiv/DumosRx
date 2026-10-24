import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

// getDashboardOverviewData and getBIMetrics each fan out to a dozen-plus independent reads.
// Rationale: docs/CLIENT_COMMENTS.md#block-__tests__-report-fanout-parallelism-test-ts-L3

const pending: { resolve: () => void }[] = [];
let issued = 0;

const mockQuery = vi.fn(() => {
  issued += 1;
  return new Promise((resolve) => {
    pending.push({ resolve: () => resolve([]) });
  });
});

// Two of getDashboardOverviewData's/getBIMetrics's reads go through lib/db/queries/finance.ts (getSmoothedExpensesTotal/ge…
// Rationale: docs/CLIENT_COMMENTS.md#line-__tests__-report-fanout-parallelism-test-ts-L21
vi.mock("@/lib/db", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/db")>();
  return { ...actual, query: mockQuery };
});

vi.mock("@/lib/db/local-database", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/db/local-database")>();
  return { ...actual, query: mockQuery };
});

vi.mock("idb-keyval", () => ({
  get: vi.fn(() => Promise.resolve(undefined)),
  set: vi.fn(() => Promise.resolve(undefined)),
}));

/** Lets the microtask queue drain so every already-issued query has had the
 * chance to fire before we look at how many are in flight. */
async function settleMicrotasks() {
  for (let i = 0; i < 50; i += 1) await Promise.resolve();
}

// Resolves every pending query, including ones a resolved query's own continuation issues afterward (getSmoothedExpensesTo…
// Rationale: docs/CLIENT_COMMENTS.md#block-__tests__-report-fanout-parallelism-test-ts-L54
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
