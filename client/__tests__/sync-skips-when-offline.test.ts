import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

const pushChangesMock = vi.fn();
const pullChangesMock = vi.fn();

vi.mock("@/lib/db/sync-engine/push", () => ({
  pushChanges: (...args: unknown[]) => pushChangesMock(...args),
}));
vi.mock("@/lib/db/sync-engine/pull", () => ({
  pullChanges: (...args: unknown[]) => pullChangesMock(...args),
}));
vi.mock("@/lib/query-client", () => ({
  queryClient: { invalidateQueries: vi.fn() },
}));
vi.mock("@/lib/db/sync-engine/schema", () => ({
  getValidColumns: vi.fn(async () => new Set()),
}));
vi.mock("@/lib/utils/dev-log", () => ({ devLog: vi.fn() }));
vi.mock("@/lib/utils/error-logger", () => ({ logCrash: vi.fn() }));
vi.mock("@/lib/api/client", () => ({
  apiClient: { getSystemConfig: vi.fn(async () => null), pullChanges: vi.fn() },
}));

/**
 * Regression coverage for the "stuck sync" false-alarm bug: sync() had no
 * navigator.onLine check of its own, relying on every call site to check
 * first — two of them (store-context's store-switch handler, auth-context's
 * PIN-recovery sync) didn't. An offline device hitting either path attempted
 * a real fetch, failed with "Failed to fetch" for every queued item, burned
 * through the sync queue's 5-attempt exponential backoff, and fired a
 * spurious "stuck sync" crash report — for an app whose entire premise is
 * working correctly while offline. Centralizing the check in sync() itself
 * (mirroring what syncSubscriptionStatus already did) protects every call
 * site at once, present and future.
 */
describe("sync() skips push/pull entirely when navigator.onLine is false", () => {
  const originalOnLine = Object.getOwnPropertyDescriptor(navigator, "onLine");

  beforeEach(() => {
    localStorage.setItem("auth_token", "fake-token");
    pushChangesMock.mockReset();
    pullChangesMock.mockReset();
  });

  afterEach(() => {
    if (originalOnLine) Object.defineProperty(navigator, "onLine", originalOnLine);
    localStorage.clear();
  });

  it("returns a clean offline result without calling pushChanges/pullChanges", async () => {
    Object.defineProperty(navigator, "onLine", { value: false, configurable: true });
    const { sync } = await import("@/lib/db/sync-engine");

    const result = await sync();

    expect(result.success).toBe(false);
    expect(result.error).toMatch(/offline/i);
    expect(pushChangesMock).not.toHaveBeenCalled();
    expect(pullChangesMock).not.toHaveBeenCalled();
  });

  it("still attempts push/pull normally when online", async () => {
    Object.defineProperty(navigator, "onLine", { value: true, configurable: true });
    pushChangesMock.mockResolvedValue({ pushed: 0, failedBatches: 0 });
    pullChangesMock.mockResolvedValue({ pulled: 0, updatedTables: [] });

    const { sync } = await import("@/lib/db/sync-engine");
    const result = await sync();

    expect(pushChangesMock).toHaveBeenCalled();
    expect(pullChangesMock).toHaveBeenCalled();
    expect(result.success).toBe(true);
  });
});
