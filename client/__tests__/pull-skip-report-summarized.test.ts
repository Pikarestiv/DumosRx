import { describe, it, expect } from "vitest";
import {
  MAX_REPORTED_SKIPS,
  summarizeSkippedRecords,
} from "@/lib/db/sync-engine/pull-skip-report";

/**
 * A pull page can skip up to the server's 500-row cap per table, and each
 * skip used to be its own crash report — so its own Sentry issue, since the
 * record id is part of the fingerprint. One run reports once.
 */
describe("summarizeSkippedRecords", () => {
  it("says nothing when nothing was skipped", () => {
    expect(summarizeSkippedRecords([])).toBeNull();
  });

  it("collapses many skips into one report that still names the count", () => {
    const skipped = Array.from({ length: 500 }, (_, i) => ({
      table: "products",
      recordId: `p-${i}`,
      reason: "insert: UNIQUE constraint failed",
    }));

    const summary = summarizeSkippedRecords(skipped);

    expect(summary).not.toBeNull();
    expect(summary!.message).toContain("500");
    expect(summary!.context.area).toBe("sync-pull");
  });

  it("carries only a bounded sample of the skipped records", () => {
    const skipped = Array.from({ length: 500 }, (_, i) => ({
      table: "products",
      recordId: `p-${i}`,
      reason: "insert: UNIQUE constraint failed",
    }));

    const sample = JSON.parse(summarizeSkippedRecords(skipped)!.context.skipped as string);

    expect(sample).toHaveLength(MAX_REPORTED_SKIPS);
  });

  it("does not put a record id in the message, so repeats share one fingerprint", () => {
    const first = summarizeSkippedRecords([
      { table: "products", recordId: "p-1", reason: "insert: UNIQUE constraint failed" },
    ]);
    const second = summarizeSkippedRecords([
      { table: "products", recordId: "p-2", reason: "insert: UNIQUE constraint failed" },
    ]);

    expect(first!.message).toBe(second!.message);
  });
});
