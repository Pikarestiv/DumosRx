import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

/**
 * Minimal same-process BroadcastChannel fake, scoped to one describe block
 * via a fresh registry per test (see its beforeEach/afterEach below). The
 * real BroadcastChannel is a genuine cross-realm primitive keyed by name,
 * not JS module state - `vi.resetModules()` gives tab-lock.ts a fresh
 * `handoffChannel` variable each test, but a real channel object it created
 * in an earlier test is never closed and keeps receiving broadcasts, so
 * reusing the real one here would leak listeners (with stale/undefined
 * callbacks) across tests and race with the current test's own listener.
 */
class FakeBroadcastChannel {
  private static registry = new Map<string, Set<FakeBroadcastChannel>>();
  private listeners = new Set<(event: { data: unknown }) => void>();
  constructor(private readonly name: string) {
    const peers = FakeBroadcastChannel.registry.get(name) ?? new Set();
    peers.add(this);
    FakeBroadcastChannel.registry.set(name, peers);
  }
  static resetAll(): void {
    FakeBroadcastChannel.registry.clear();
  }
  addEventListener(_type: "message", fn: (event: { data: unknown }) => void): void {
    this.listeners.add(fn);
  }
  removeEventListener(_type: "message", fn: (event: { data: unknown }) => void): void {
    this.listeners.delete(fn);
  }
  postMessage(data: unknown): void {
    const peers = FakeBroadcastChannel.registry.get(this.name) ?? new Set();
    for (const peer of peers) {
      if (peer === this) continue; // never delivered back to the sender - matches the real API
      queueMicrotask(() => {
        for (const fn of peer.listeners) fn({ data });
      });
    }
  }
  close(): void {
    FakeBroadcastChannel.registry.get(this.name)?.delete(this);
  }
}

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
    await initWriterLock(onPromoted, vi.fn());

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

    await initWriterLock(vi.fn(), vi.fn());

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

    const onPromoted = vi.fn(async () => true);
    const onChange = vi.fn();
    onWriterTabChange(onChange);

    await initWriterLock(onPromoted, vi.fn());

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

  it("refuses to promote (and notifies onPromotionFailed) when rehydrating on promotion fails, rather than writing stale data", async () => {
    let queuedGrant: ((lock?: unknown) => Promise<void>) | null = null;

    Object.defineProperty(navigator, "locks", {
      configurable: true,
      value: {
        request: (
          _name: string,
          opts: { ifAvailable?: boolean },
          cb: (lock: unknown) => Promise<void>,
        ) => {
          if (opts.ifAvailable) return Promise.resolve(cb(null));
          queuedGrant = cb;
          return new Promise<void>(() => {});
        },
      },
    });
    const { initWriterLock, isWriterTab, onPromotionFailed } = await import(
      "@/lib/db/tab-lock"
    );

    const onPromoted = vi.fn(async () => false); // simulates a failed rehydrate
    const onFailed = vi.fn();
    onPromotionFailed(onFailed);

    await initWriterLock(onPromoted, vi.fn());
    expect(isWriterTab()).toBe(false);

    void queuedGrant!();
    await new Promise((resolve) => setTimeout(resolve, 0));
    await new Promise((resolve) => setTimeout(resolve, 0));

    expect(onPromoted).toHaveBeenCalledTimes(1);
    // Still read-only: refusing to promote on a failed rehydrate must never
    // silently flip this tab to writer over possibly-stale local data.
    expect(isWriterTab()).toBe(false);
    expect(onFailed).toHaveBeenCalledTimes(1);
  });

  it("falls back to writer if the lock request itself rejects", async () => {
    Object.defineProperty(navigator, "locks", {
      configurable: true,
      value: {
        request: () => Promise.reject(new Error("boom")),
      },
    });
    const { initWriterLock, isWriterTab } = await import("@/lib/db/tab-lock");

    await initWriterLock(vi.fn(), vi.fn());

    expect(isWriterTab()).toBe(true);
  });
});

/**
 * Graceful handoff (BroadcastChannel handshake): a read-only tab can ask the
 * current writer tab to force a save and voluntarily release the Web Lock,
 * rather than waiting for it to close on its own. jsdom/Node both provide a
 * real BroadcastChannel; tests use a second, independently-constructed
 * instance with the same channel name to stand in for "the other tab" -
 * BroadcastChannel deliberately never delivers a message back to the
 * instance that sent it, so reusing tab-lock's own internal channel for
 * both sides of a handshake within one test would never see anything.
 */
describe("tab-lock: writer handoff handshake", () => {
  const HANDOFF_CHANNEL_NAME = "dumosrx-db-writer-handoff";
  const originalBroadcastChannel = globalThis.BroadcastChannel;
  let otherTabChannel: FakeBroadcastChannel;

  beforeEach(() => {
    vi.resetModules();
    FakeBroadcastChannel.resetAll();
    globalThis.BroadcastChannel = FakeBroadcastChannel as unknown as typeof BroadcastChannel;
    otherTabChannel = new FakeBroadcastChannel(HANDOFF_CHANNEL_NAME);
  });

  afterEach(() => {
    otherTabChannel.close();
    globalThis.BroadcastChannel = originalBroadcastChannel;
  });

  it("acks a takeover request: writer force-saves, then drops to read-only and releases the lock", async () => {
    Object.defineProperty(navigator, "locks", {
      configurable: true,
      value: {
        // This tab wins the lock outright (it's the writer under test) and
        // its queued/steal requests are never exercised here.
        request: (
          _name: string,
          opts: { ifAvailable?: boolean },
          cb: (lock: unknown) => Promise<void>,
        ) => (opts.ifAvailable ? Promise.resolve(cb({})) : new Promise<void>(() => {})),
      },
    });

    const { initWriterLock, isWriterTab } = await import("@/lib/db/tab-lock");

    const onPromoted = vi.fn(async () => true);
    const onTakeoverRequested = vi.fn(async () => {});

    await initWriterLock(onPromoted, onTakeoverRequested);
    expect(isWriterTab()).toBe(true);

    const ackPromise = new Promise<{ type: string; requestId: string }>((resolve) => {
      otherTabChannel.addEventListener("message", (e) =>
        resolve(e.data as { type: string; requestId: string }),
      );
    });
    otherTabChannel.postMessage({ type: "takeover-request", requestId: "req-1" });
    const ack = await ackPromise;

    expect(ack).toEqual({ type: "takeover-ack", requestId: "req-1" });
    expect(onTakeoverRequested).toHaveBeenCalledTimes(1);
    expect(isWriterTab()).toBe(false);
  });

  it("requestWriterTakeover resolves 'acked' once the other side responds on the handoff channel", async () => {
    Object.defineProperty(navigator, "locks", {
      configurable: true,
      value: { request: () => new Promise<void>(() => {}) },
    });
    const { requestWriterTakeover } = await import("@/lib/db/tab-lock");

    otherTabChannel.addEventListener("message", (e) => {
      const data = e.data as { type: string; requestId: string };
      if (data.type !== "takeover-request") return;
      otherTabChannel.postMessage({ type: "takeover-ack", requestId: data.requestId });
    });

    await expect(requestWriterTakeover()).resolves.toBe("acked");
  });

  it("requestWriterTakeover resolves 'timeout' when nothing acks the request", async () => {
    vi.useFakeTimers();
    Object.defineProperty(navigator, "locks", {
      configurable: true,
      value: { request: () => new Promise<void>(() => {}) },
    });
    const { requestWriterTakeover } = await import("@/lib/db/tab-lock");

    const resultPromise = requestWriterTakeover();
    await vi.advanceTimersByTimeAsync(10_000);

    await expect(resultPromise).resolves.toBe("timeout");
    vi.useRealTimers();
  });

  it("stealWriterLock forcibly acquires the lock with {steal: true} and promotes without waiting for an ack", async () => {
    const requests: Array<{ opts: Record<string, unknown> }> = [];
    Object.defineProperty(navigator, "locks", {
      configurable: true,
      value: {
        request: (
          _name: string,
          opts: Record<string, unknown>,
          cb: (lock: unknown) => Promise<void>,
        ) => {
          requests.push({ opts });
          if (opts.steal) return Promise.resolve(cb({}));
          if (opts.ifAvailable) return Promise.resolve(cb(null)); // contested - read-only
          // This tab's queued request behind the current (never-modeled)
          // holder - stays pending, putting this tab in the read-only state
          // stealWriterLock() is meant to be called from.
          return new Promise<void>(() => {});
        },
      },
    });
    const { initWriterLock, stealWriterLock, isWriterTab } = await import("@/lib/db/tab-lock");

    await initWriterLock(vi.fn(async () => true), vi.fn(async () => {}));
    expect(isWriterTab()).toBe(false);

    const onPromoted = vi.fn(async () => true);
    const result = await stealWriterLock(onPromoted);

    expect(result).toBe(true);
    expect(isWriterTab()).toBe(true);
    expect(onPromoted).toHaveBeenCalledTimes(1);
    expect(requests.some((r) => r.opts.steal === true)).toBe(true);
  });

  it("stealWriterLock refuses to promote (like normal promotion) when rehydrating fails", async () => {
    Object.defineProperty(navigator, "locks", {
      configurable: true,
      value: {
        request: (
          _name: string,
          opts: Record<string, unknown>,
          cb: (lock: unknown) => Promise<void>,
        ) => {
          if (opts.steal) return Promise.resolve(cb({}));
          if (opts.ifAvailable) return Promise.resolve(cb(null)); // contested - read-only
          return new Promise<void>(() => {}); // this tab's own queued request
        },
      },
    });
    const { initWriterLock, stealWriterLock, isWriterTab, onPromotionFailed } = await import(
      "@/lib/db/tab-lock"
    );
    await initWriterLock(vi.fn(async () => true), vi.fn(async () => {}));
    expect(isWriterTab()).toBe(false);

    const onFailed = vi.fn();
    onPromotionFailed(onFailed);

    const result = await stealWriterLock(async () => false);

    expect(result).toBe(false);
    expect(isWriterTab()).toBe(false);
    expect(onFailed).toHaveBeenCalledTimes(1);
  });
});
