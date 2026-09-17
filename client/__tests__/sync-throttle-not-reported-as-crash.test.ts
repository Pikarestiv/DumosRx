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
    const { isExpectedSyncRestriction } = await import("@/lib/utils/error-logger");

    expect(
      isExpectedSyncRestriction(new Error("Sync limit reached. Try again later.")),
    ).toBe(true);
    expect(isExpectedSyncRestriction(new Error("Network request failed"))).toBe(
      false,
    );
  });
});
