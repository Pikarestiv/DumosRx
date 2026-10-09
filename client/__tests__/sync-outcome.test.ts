import { describe, it, expect, beforeEach, vi } from "vitest";
import {
  recordSyncOutcome,
  readSyncOutcome,
} from "@/lib/db/sync-engine/sync-outcome";

/**
 * `last_sync_time` is stamped only on success, so a device failing every round
 * for two days read identically to one that had simply never synced — and the
 * reason lived in the indicator's React state and died on navigation. "Why do
 * 50 changes keep failing" was unanswerable because of that gap.
 */
describe("sync outcome", () => {
  beforeEach(() => localStorage.clear());

  it("is absent before any attempt", () => {
    expect(readSyncOutcome()).toBeNull();
  });

  it("records a success with what moved", () => {
    recordSyncOutcome({ success: true, pushed: 12, pulled: 40 });

    const outcome = readSyncOutcome()!;
    expect(outcome.success).toBe(true);
    expect(outcome.pushed).toBe(12);
    expect(outcome.pulled).toBe(40);
    expect(outcome.reason).toBeNull();
  });

  it("records a failure with a reason CLASS, never the raw driver error", () => {
    // A raw sync error can be a driver message quoting the attempted
    // statement, which the diagnostics report must never carry.
    recordSyncOutcome({
      success: false,
      pushed: 0,
      pulled: 0,
      error: "SQLSTATE[23000]: INSERT INTO users (pin) VALUES ('$2y$12$secret')",
    });

    const outcome = readSyncOutcome()!;
    expect(outcome.success).toBe(false);
    expect(outcome.reason).not.toMatch(/secret/);
    expect(outcome.reason).not.toMatch(/INSERT INTO/);
  });

  it("overwrites the previous attempt, so this is always the latest", () => {
    recordSyncOutcome({ success: false, pushed: 0, pulled: 0, error: "offline" });
    recordSyncOutcome({ success: true, pushed: 1, pulled: 2 });

    expect(readSyncOutcome()!.success).toBe(true);
  });

  it("survives a non-string error without throwing", () => {
    recordSyncOutcome({
      success: false,
      pushed: 0,
      pulled: 0,
      error: new Error("boom") as unknown as string,
    });

    expect(readSyncOutcome()!.success).toBe(false);
  });

  it("answers null rather than throwing on a corrupt entry", () => {
    localStorage.setItem("dumos_last_sync_outcome", "{not json");

    expect(readSyncOutcome()).toBeNull();
  });

  it("never throws when storage is unavailable", () => {
    const spy = vi.spyOn(window.localStorage, "setItem").mockImplementation(() => {
      throw new Error("blocked");
    });

    expect(() => recordSyncOutcome({ success: true, pushed: 0, pulled: 0 })).not.toThrow();
    spy.mockRestore();
  });

  it("names each sync-level failure instead of collapsing every one to 'other'", () => {
    // canonicaliseReason knows the SERVER's refusal vocabulary, so every
    // sync-level failure came out as "other" — including the stuck-push case
    // this exists to diagnose, which made the card useless.
    const cases: [string, string][] = [
      ["Offline. Changes are saved locally and will sync.", "network"],
      ["Failed to fetch", "network"],
      ["Unauthenticated. Please link your cloud account in settings.", "unauthenticated"],
      ["3 batch(es) failed to push; will retry automatically", "batches_failed"],
      ["SYNC_THROTTLED", "throttled"],
    ];

    for (const [error, expected] of cases) {
      recordSyncOutcome({ success: false, pushed: 0, pulled: 0, error });
      expect(readSyncOutcome()!.reason, error).toBe(expected);
    }
  });

  it("does not record a refused pre-flight, which would overwrite a real outcome", async () => {
    const { SYNC_IN_PROGRESS_ERROR, READ_ONLY_TAB_MESSAGE } = await import(
      "@/lib/db/sync-engine/sync-outcome"
    );
    const { SYNC_DISABLED_IMPERSONATION_MESSAGE } = await import(
      "@/lib/utils/impersonation"
    );

    recordSyncOutcome({ success: true, pushed: 5, pulled: 9 });

    // An inspection session's own mount tick is refused as impersonated, and a
    // second PWA tab is refused as read-only while sharing this storage key —
    // so both fire during the very session that reads the outcome.
    for (const error of [
      SYNC_IN_PROGRESS_ERROR,
      READ_ONLY_TAB_MESSAGE,
      SYNC_DISABLED_IMPERSONATION_MESSAGE,
    ]) {
      recordSyncOutcome({ success: false, pushed: 0, pulled: 0, error });
      expect(readSyncOutcome()!.success, error).toBe(true);
      expect(readSyncOutcome()!.pushed).toBe(5);
    }
  });
});
