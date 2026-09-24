import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

/**
 * Regression coverage for the single-writer-tab election in tab-lock.ts
 * (docs/KNOWN_BUGS.md C1 - two browser/PWA tabs could silently overwrite
 * each other's committed sql.js data with no error or warning). jsdom
 * doesn't implement the Web Locks API at all, so every scenario here stubs
 * `navigator.locks` directly rather than relying on a real browser lock.
 */
describe("tab-lock", () => {
  const originalLocks = (navigator as unknown as { locks?: unknown }).locks;

  beforeEach(() => {
    vi.resetModules();
  });

  afterEach(() => {
    Object.defineProperty(navigator, "locks", {
      value: originalLocks,
      configurable: true,
    });
  });

  it("acts as the writer immediately when the Web Locks API isn't supported at all", async () => {
    Object.defineProperty(navigator, "locks", { value: undefined, configurable: true });
    const { initWriterLock, isWriterTab } = await import("@/lib/db/tab-lock");

    const onPromoted = vi.fn();
    await initWriterLock(onPromoted);

    expect(isWriterTab()).toBe(true);
    expect(onPromoted).not.toHaveBeenCalled();
  });

  it("becomes the writer immediately when no other tab holds the lock", async () => {
    Object.defineProperty(navigator, "locks", {
      configurable: true,
      value: {
        request: (
          _name: string,
          opts: { ifAvailable?: boolean },
          cb: (lock: unknown) => Promise<void>,
        ) => {
          expect(opts.ifAvailable).toBe(true);
          return Promise.resolve(cb({}));
        },
      },
    });
    const { initWriterLock, isWriterTab } = await import("@/lib/db/tab-lock");

    await initWriterLock(vi.fn());

    expect(isWriterTab()).toBe(true);
  });

  it("becomes read-only when another tab already holds the lock, then is promoted (after rehydrating) once that tab releases it", async () => {
    let queuedGrant: ((lock?: unknown) => Promise<void>) | null = null;

    Object.defineProperty(navigator, "locks", {
      configurable: true,
      value: {
        request: (
          _name: string,
          opts: { ifAvailable?: boolean },
          cb: (lock: unknown) => Promise<void>,
        ) => {
          if (opts.ifAvailable) {
            // Simulates the lock already being held elsewhere.
            return Promise.resolve(cb(null));
          }
          // The real, queuing request - captured so the test can decide when
          // "the other tab closed" and this one is granted the lock.
          queuedGrant = cb;
          return new Promise<void>(() => {});
        },
      },
    });
    const { initWriterLock, isWriterTab, onWriterTabChange } = await import(
      "@/lib/db/tab-lock"
    );

    const onPromoted = vi.fn(async () => {});
    const onChange = vi.fn();
    onWriterTabChange(onChange);

    await initWriterLock(onPromoted);

    expect(isWriterTab()).toBe(false);
    expect(onPromoted).not.toHaveBeenCalled();

    // "The other tab closes" - the queued lock request is now granted. Not
    // awaited directly: like the real Web Locks API, the callback holds the
    // lock (and its returned promise) open indefinitely once granted, so
    // only a couple of microtask ticks are awaited here, enough for
    // onPromoted() and the writer-flag flip inside it to run.
    expect(queuedGrant).not.toBeNull();
    void queuedGrant!();
    await new Promise((resolve) => setTimeout(resolve, 0));
    await new Promise((resolve) => setTimeout(resolve, 0));

    expect(onPromoted).toHaveBeenCalledTimes(1);
    expect(isWriterTab()).toBe(true);
    expect(onChange).toHaveBeenCalledWith(false);
    expect(onChange).toHaveBeenCalledWith(true);
  });

  it("falls back to writer if the lock request itself rejects", async () => {
    Object.defineProperty(navigator, "locks", {
      configurable: true,
      value: {
        request: () => Promise.reject(new Error("boom")),
      },
    });
    const { initWriterLock, isWriterTab } = await import("@/lib/db/tab-lock");

    await initWriterLock(vi.fn());

    expect(isWriterTab()).toBe(true);
  });
});
