import { describe, it, expect, beforeEach, vi } from "vitest";

/**
 * A stale chunk reloads once, which is right - the reload fetches the new
 * shell. But the guard lived in sessionStorage and was cleared on every
 * successful mount, so a shell that stays stale reloaded forever: boot clears
 * the guard, navigate, chunk fails, reload, boot clears the guard. Observed in
 * production on 2026-10-12 after a deploy: one device reloading /inventory
 * every ~3 seconds, indefinitely.
 *
 * The cap is per BUILD, not per tab: one reload is the whole remedy, and if
 * the same build fails again, reloading it cannot help.
 */
describe("chunk-error reloads are bounded per build", () => {
  beforeEach(() => {
    localStorage.clear();
    sessionStorage.clear();
    vi.resetModules();
  });

  it("allows the first reload for a build and refuses the second", async () => {
    const { shouldReloadForChunkError } = await import("@/lib/utils/chunk-error");

    expect(shouldReloadForChunkError("build-a")).toBe(true);
    expect(shouldReloadForChunkError("build-a")).toBe(false);
    expect(shouldReloadForChunkError("build-a")).toBe(false);
  });

  it("allows a reload again once a new build is deployed", async () => {
    const { shouldReloadForChunkError } = await import("@/lib/utils/chunk-error");

    expect(shouldReloadForChunkError("build-a")).toBe(true);
    expect(shouldReloadForChunkError("build-a")).toBe(false);
    expect(shouldReloadForChunkError("build-b")).toBe(true);
  });

  /** Private-mode Safari and blocked storage throw on access; a diagnostic
   * guard must never be the thing that breaks the app. */
  it("permits the reload when storage is unavailable", async () => {
    const getItem = vi.spyOn(Storage.prototype, "getItem").mockImplementation(() => {
      throw new Error("blocked");
    });
    const { shouldReloadForChunkError } = await import("@/lib/utils/chunk-error");

    expect(shouldReloadForChunkError("build-a")).toBe(true);
    getItem.mockRestore();
  });
});
