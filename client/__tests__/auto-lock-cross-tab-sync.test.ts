import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";

/**
 * Regression coverage for a real reported bug: disabling Auto-Lock in
 * Settings would sometimes silently revert to 5 minutes and resume locking.
 * Root cause: zustand's persist middleware writes this tab's *entire*
 * in-memory state back to localStorage on every set() call. A second
 * tab/window left open from before the change (still holding the old
 * `duration` in memory) would clobber the new value back on its very next
 * updateActivity() call (any mousemove/keydown/etc in that stale tab).
 *
 * Fixed by listening for the storage event and rehydrating from whatever
 * was last written, so a stale tab picks up the change before it can write
 * its own outdated state back over it.
 */

vi.mock("@/lib/hooks/use-feature-gate", () => ({
  useFeatureGate: () => ({
    canAutoLock: true,
    withRestriction: (fn: (...args: unknown[]) => void) => fn,
    getUpgradeMessage: () => "",
  }),
}));

describe("Auto-Lock cross-tab sync", () => {
  beforeEach(() => {
    localStorage.clear();
    vi.resetModules();
  });

  afterEach(() => {
    vi.resetModules();
  });

  it("rehydrates this tab's in-memory duration when another tab writes a new value", async () => {
    const { useAutoLockStore } = await import("@/lib/hooks/use-auto-lock");

    // Simulate this tab having started with the old default (5) still in memory.
    expect(useAutoLockStore.getState().duration).toBe(5);

    // Another tab disables auto-lock and its persist middleware writes the
    // new full state to localStorage.
    localStorage.setItem(
      "dumos_autolock",
      JSON.stringify({
        state: { duration: 0, isLocked: false, lastActivity: Date.now() },
        version: 0,
      }),
    );
    window.dispatchEvent(
      new StorageEvent("storage", { key: "dumos_autolock", storageArea: localStorage }),
    );

    await useAutoLockStore.persist.rehydrate();

    // This tab's in-memory state now matches — its next updateActivity()
    // call won't write the stale duration:5 back over the disable.
    expect(useAutoLockStore.getState().duration).toBe(0);
  });

  it("ignores storage events for unrelated keys", async () => {
    const { useAutoLockStore } = await import("@/lib/hooks/use-auto-lock");
    useAutoLockStore.setState({ duration: 15 });

    window.dispatchEvent(
      new StorageEvent("storage", { key: "some_other_key", storageArea: localStorage }),
    );

    expect(useAutoLockStore.getState().duration).toBe(15);
  });
});
