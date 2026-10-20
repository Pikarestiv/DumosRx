import { describe, it, expect, vi, beforeEach } from "vitest";

const captureExceptionMock = vi.fn();

vi.mock("@sentry/nextjs", () => ({
  captureException: (...args: unknown[]) => captureExceptionMock(...args),
}));
vi.mock("@/lib/utils/device-id", () => ({ getDeviceId: () => "test-device" }));
vi.mock("@/lib/db/local-database", () => ({ insert: vi.fn() }));
vi.mock("@/lib/api/client", () => ({
  apiClient: { getBaseURL: () => "http://localhost" },
}));
vi.mock("@/lib/api/logger", () => ({ reportClientError: vi.fn() }));

// Regression coverage for a real Sentry report:
// Rationale: docs/CLIENT_COMMENTS.md#block-__tests__-sync-throttle-not-reported-as-crash-test-ts-L15
describe("logCrash skips reporting for expected sync plan restrictions", () => {
  beforeEach(() => {
    captureExceptionMock.mockReset();
  });

  it("does not report a SYNC_THROTTLED error to Sentry", async () => {
    const { logCrash } = await import("@/lib/utils/error-logger");

    const err = new Error(
      "Sync limit reached. Your current plan synchronizes once every 30 minutes. Last sync: 21 minutes ago. Please upgrade your plan for faster sync.",
    ) as Error & { code?: string };
    err.code = "SYNC_THROTTLED";

    await logCrash(err, false, { area: "sync-pull" });

    expect(captureExceptionMock).not.toHaveBeenCalled();
  });

  it("still reports a genuine sync error to Sentry", async () => {
    const { logCrash } = await import("@/lib/utils/error-logger");

    await logCrash(new Error("Unexpected token in JSON"), false, { area: "sync-pull" });

    expect(captureExceptionMock).toHaveBeenCalledTimes(1);
  });

  it("recognizes the restriction by message when no code is attached", async () => {
    const { isExpectedSyncNoise } = await import("@/lib/utils/error-logger");

    expect(
      isExpectedSyncNoise(new Error("Sync limit reached. Try again later.")),
    ).toBe(true);
    expect(isExpectedSyncNoise(new Error("Unexpected token in JSON"))).toBe(
      false,
    );
  });

  // A-273. Two more outcomes that are not bugs and were filling Sentry and the `feedback` table:
  // Rationale: docs/CLIENT_COMMENTS.md#block-__tests__-sync-throttle-not-reported-as-crash-test-ts-L63
  it("treats a read-only tab and a genuine network failure as expected", async () => {
    const { isExpectedSyncNoise } = await import("@/lib/utils/error-logger");

    expect(
      isExpectedSyncNoise(
        new Error(
          "This tab is read-only because DumosRx is already open in another tab or window. Switch to that tab, or close it, to make changes here.",
        ),
      ),
    ).toBe(true);
    expect(isExpectedSyncNoise(new Error("Failed to fetch"))).toBe(true);
    expect(isExpectedSyncNoise(new Error("Load failed"))).toBe(true);
  });

  // A-273. The two lists are read by two different kinds of consumer.
  // Rationale: docs/CLIENT_COMMENTS.md#block-__tests__-sync-throttle-not-reported-as-crash-test-ts-L82
  it("keeps a network failure out of the plan-restriction check the UI reads", async () => {
    const { isExpectedPlanRestriction, isExpectedSyncNoise } = await import(
      "@/lib/utils/error-logger"
    );

    for (const transient of [
      "Failed to fetch",
      "Load failed",
      "This tab is read-only because DumosRx is already open in another tab or window.",
    ]) {
      expect(isExpectedSyncNoise(new Error(transient))).toBe(true);
      expect(isExpectedPlanRestriction(new Error(transient))).toBe(false);
    }
  });

  it("keeps every plan restriction in both checks", async () => {
    const { isExpectedPlanRestriction, isExpectedSyncNoise } = await import(
      "@/lib/utils/error-logger"
    );

    const throttled = new Error("Sync limit reached. Try again later.") as Error & {
      code?: string;
    };
    throttled.code = "SYNC_THROTTLED";

    expect(isExpectedPlanRestriction(throttled)).toBe(true);
    expect(isExpectedSyncNoise(throttled)).toBe(true);
    expect(
      isExpectedPlanRestriction(new Error("Cloud sync is disabled on your current plan")),
    ).toBe(true);
    expect(isExpectedPlanRestriction(new Error("Unexpected token in JSON"))).toBe(false);
  });

  it("does not report a read-only-tab write to Sentry", async () => {
    const { logCrash } = await import("@/lib/utils/error-logger");

    await logCrash(
      new Error(
        "This tab is read-only because DumosRx is already open in another tab or window. Switch to that tab, or close it, to make changes here.",
      ),
      false,
      { area: "sync-push" },
    );

    expect(captureExceptionMock).not.toHaveBeenCalled();
  });
});
