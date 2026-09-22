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
 * Impersonation (a superadmin handing off into a store's app via
 * app/auth/callback/page.tsx) is read-only support access. Nothing used to
 * gate sync during such a session: the sync indicator's auto-sync daemon
 * looked only at auto_sync_enabled/auto_sync_interval plus "is cloud linked",
 * and the manual sync button was unguarded too — so a background sync could
 * push the impersonator's local writes, or pull-overwrite local state, under
 * ambiguous attribution and bypassing the real store owner's own sync
 * settings and audit trail.
 *
 * The gate lives in sync() itself (not in the UI) so no call site can bypass
 * it: manual button, interval timer, instant on-change listener, store
 * switcher, license guard, the PIN-recovery sync in auth-context, and
 * onboarding's post-restore sync all go through this one function.
 */
describe("sync() refuses to run during an impersonated session", () => {
  const originalOnLine = Object.getOwnPropertyDescriptor(navigator, "onLine");

  beforeEach(() => {
    localStorage.clear();
    localStorage.setItem("auth_token", "fake-token");
    Object.defineProperty(navigator, "onLine", { value: true, configurable: true });
    pushChangesMock.mockReset();
    pullChangesMock.mockReset();
    pushChangesMock.mockResolvedValue({ pushed: 0, failedBatches: 0 });
    pullChangesMock.mockResolvedValue({ pulled: 0, updatedTables: [] });
  });

  afterEach(() => {
    if (originalOnLine) Object.defineProperty(navigator, "onLine", originalOnLine);
    localStorage.clear();
  });

  it("short-circuits with a clear reason when the impersonated profile is present", async () => {
    localStorage.setItem(
      "dumos_impersonated_user",
      JSON.stringify({ id: "foreign-user-1", username: "foreignstaff" }),
    );

    const { sync } = await import("@/lib/db/sync-engine");
    const result = await sync();

    expect(result.success).toBe(false);
    expect(String(result.error)).toMatch(/sync disabled: impersonated session/i);
    expect(result.pushed).toBe(0);
    expect(result.pulled).toBe(0);
    expect(pushChangesMock).not.toHaveBeenCalled();
    expect(pullChangesMock).not.toHaveBeenCalled();
    // Nothing recorded as a completed sync, so the indicator can't claim a
    // fresh "last synced" timestamp for a sync that never happened.
    expect(localStorage.getItem("last_sync_time")).toBeNull();
  });

  it("also refuses when only the impersonator return code survives", async () => {
    // The admin panel can fail to mint a return code while the impersonation
    // itself still proceeds, and "End Session" can clear one flag but not the
    // other — either flag alone still means "impersonated".
    localStorage.setItem("impersonator_handoff_return_code", "return-code-1");

    const { sync } = await import("@/lib/db/sync-engine");
    const result = await sync();

    expect(result.success).toBe(false);
    expect(String(result.error)).toMatch(/impersonated session/i);
    expect(pushChangesMock).not.toHaveBeenCalled();
    expect(pullChangesMock).not.toHaveBeenCalled();
  });

  it("does not throw, so existing .catch()-less call sites stay unaffected", async () => {
    localStorage.setItem("dumos_impersonated_user", JSON.stringify({ id: "x" }));
    const { sync } = await import("@/lib/db/sync-engine");
    await expect(sync(true)).resolves.toMatchObject({ success: false });
  });

  it("a manual sync is blocked too, not just background sync", async () => {
    localStorage.setItem("dumos_impersonated_user", JSON.stringify({ id: "x" }));
    const { sync } = await import("@/lib/db/sync-engine");

    await sync(true); // isManual
    await sync(false, true); // isSetup (onboarding's post-restore sync)

    expect(pushChangesMock).not.toHaveBeenCalled();
    expect(pullChangesMock).not.toHaveBeenCalled();
  });

  it("syncs exactly as before for a normal, non-impersonated session", async () => {
    const { sync } = await import("@/lib/db/sync-engine");
    const result = await sync();

    expect(pushChangesMock).toHaveBeenCalled();
    expect(pullChangesMock).toHaveBeenCalled();
    expect(result.success).toBe(true);
  });
});
