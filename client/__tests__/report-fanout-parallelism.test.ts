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

vi.mock("@/lib/db", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/db")>();
  return {
    ...actual,
    query: vi.fn(() => {
      issued += 1;
      return new Promise((resolve) => {
        pending.push({ resolve: () => resolve([]) });
      });
    }),
  };
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

describe("report fan-out parallelism", () => {
  beforeEach(() => {
    pending.length = 0;
    issued = 0;
  });

  afterEach(() => {
    // Nothing should be left hanging between cases.
    pending.forEach((p) => p.resolve());
  });

  it("issues getDashboardOverviewData's independent reads concurrently", async () => {
    const { getDashboardOverviewData } = await import("@/lib/db/queries/reports");

    const inFlight = getDashboardOverviewData();
    await settleMicrotasks();

    // Sequential awaits would leave exactly one query in flight here.
    expect(issued).toBeGreaterThanOrEqual(10);

    pending.forEach((p) => p.resolve());
    await inFlight;
  });

  it("issues getBIMetrics's independent reads concurrently", async () => {
    const { getBIMetrics } = await import("@/lib/db/queries/reports");

    const inFlight = getBIMetrics("2026-01-01", "2025-12-01", undefined, "2026-01-31");
    await settleMicrotasks();

    expect(issued).toBeGreaterThanOrEqual(15);

    pending.forEach((p) => p.resolve());
    await inFlight;
  });
});
