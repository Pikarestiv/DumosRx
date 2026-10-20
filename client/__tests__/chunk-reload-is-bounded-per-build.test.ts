import { describe, it, expect, beforeEach, vi } from "vitest";

// A stale chunk reloads once, which is right - the reload fetches the new shell.
// Rationale: docs/CLIENT_COMMENTS.md#block-__tests__-chunk-reload-is-bounded-per-build-test-ts-L3
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
