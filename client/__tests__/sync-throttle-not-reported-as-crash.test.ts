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

/**
 * Regression coverage for a real Sentry report: a plan's sync-interval
 * throttle (SyncController::validateSync's SYNC_THROTTLED response, "Sync
 * limit reached... Please upgrade your plan for faster sync") reached the
 * user during a completely normal navigation to /inventory, not a bug -
 * base-client.ts throws it the same way as any other failed request, and
 * pull.ts/sync-engine's logCrash() shipped it to Sentry as an "error" issue
 * regardless. base-client.ts now tags the thrown Error with the server's
 * `code`, and logCrash() skips Sentry (and the own-server/feedback
 * pipelines) for the known set of expected plan-restriction codes.
 */
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

  /**
   * A-273. Two more outcomes that are not bugs and were filling Sentry and the
   * `feedback` table: a tab that lost the single-writer election (core.ts's
   * assertWritable), and a device that is simply offline or on a flaky link.
   */
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

  /**
   * A-273. The two lists are read by two different kinds of consumer. A
   * cashier shown "online" while nothing reaches the server is the silent
   * divergence this whole batch exists to prevent, so the UI's check must stay
   * narrow: only the server telling this device to slow down or upgrade may
   * suppress the error state.
   */
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
