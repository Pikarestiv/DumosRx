import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

const captureExceptionMock = vi.fn();
const addBreadcrumbMock = vi.fn();
const insertMock = vi.fn();
const reportClientErrorMock = vi.fn();

vi.mock("@sentry/nextjs", () => ({
  captureException: (...args: unknown[]) => captureExceptionMock(...args),
  addBreadcrumb: (...args: unknown[]) => addBreadcrumbMock(...args),
}));
vi.mock("@/lib/utils/device-id", () => ({ getDeviceId: () => "test-device" }));
vi.mock("@/lib/db/local-database", () => ({
  insert: (...args: unknown[]) => insertMock(...args),
  update: vi.fn(),
  query: vi.fn(async () => []),
}));
vi.mock("@/lib/api/client", () => ({
  apiClient: { getBaseURL: () => "http://localhost" },
}));
vi.mock("@/lib/api/logger", () => ({
  reportClientError: (...args: unknown[]) => reportClientErrorMock(...args),
}));

// The owner's Sentry quota was being spent on events that are not faults:
// Rationale: docs/CLIENT_COMMENTS.md#block-__tests__-sentry-non-errors-not-reported-test-ts-L25
describe("non-errors and repeats do not become Sentry issues", () => {
  beforeEach(() => {
    captureExceptionMock.mockReset();
    addBreadcrumbMock.mockReset();
    insertMock.mockReset();
    reportClientErrorMock.mockReset();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("sends one Sentry event per fingerprint per throttle window, not one per throw", async () => {
    const { logCrash } = await import("@/lib/utils/error-logger");

    for (let i = 0; i < 25; i += 1) {
      await logCrash(new Error("Pull window rewind budget exhausted"), false, {
        area: "sync-pull-window",
        table: "stock_movements",
      });
    }

    expect(captureExceptionMock).toHaveBeenCalledTimes(1);
  });

  it("holds a recurring fault back from Sentry for far longer than from our own server", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-10-19T00:00:00Z"));

    const { logCrash, SENTRY_THROTTLE_MS, REPORT_THROTTLE_MS } = await import(
      "@/lib/utils/error-logger"
    );
    expect(SENTRY_THROTTLE_MS).toBeGreaterThan(REPORT_THROTTLE_MS);

    // A device that cannot converge reports every sync round, by design
    // (A-229). Over an hour of 7-minute rounds that is nine reports.
    for (let i = 0; i < 9; i += 1) {
      await logCrash(new Error("this device cannot converge on its own"), false, {
        area: "sync-pull-window",
      });
      vi.setSystemTime(new Date(Date.now() + 7 * 60_000));
    }

    expect(reportClientErrorMock.mock.calls.length).toBeGreaterThan(1);
    expect(captureExceptionMock).toHaveBeenCalledTimes(1);
  });

  it("keeps an informational report out of Sentry's issues entirely", async () => {
    const { logCrash } = await import("@/lib/utils/error-logger");

    await logCrash(
      new Error("Stock auto-heal corrected 4 batch(es) of 1408 (net +124 units)"),
      false,
      { area: "stock-autoheal", informational: true },
    );

    expect(captureExceptionMock).not.toHaveBeenCalled();
    expect(addBreadcrumbMock).toHaveBeenCalledTimes(1);
  });

  it("still records an informational report locally and to our own server", async () => {
    const { logCrash } = await import("@/lib/utils/error-logger");

    await logCrash(new Error("Sync health check found this device behind the server"), false, {
      area: "sync-health-check",
      informational: true,
    });

    expect(insertMock).toHaveBeenCalledTimes(1);
    expect(reportClientErrorMock).toHaveBeenCalledTimes(1);
  });

  it("does not report an unauthenticated device at all", async () => {
    const { logCrash, isExpectedSyncNoise } = await import("@/lib/utils/error-logger");

    expect(isExpectedSyncNoise(new Error("Unauthenticated."))).toBe(true);

    await logCrash(new Error("Unauthenticated."), false, { area: "sync-run" });

    expect(captureExceptionMock).not.toHaveBeenCalled();
    expect(addBreadcrumbMock).not.toHaveBeenCalled();
    expect(insertMock).not.toHaveBeenCalled();
    expect(reportClientErrorMock).not.toHaveBeenCalled();
  });
});
