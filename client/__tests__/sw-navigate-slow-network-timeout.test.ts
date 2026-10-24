import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

// A-160: the navigate handler's "network first" fetch was bounded by a flat 4000ms abort, chosen only to stop iOS Safari p…
// Rationale: docs/CLIENT_COMMENTS.md#block-__tests__-sw-navigate-slow-network-timeout-test-ts-L5
describe("sw.js navigate fetch timeout on a slow connection", () => {
  const source = readFileSync(resolve(__dirname, "../public/sw.js"), "utf8");

  const loadServiceWorker = () => {
    const listeners = new Map<string, (event: unknown) => void>();
    const stubSelf = {
      addEventListener: (type: string, listener: (event: unknown) => void) =>
        listeners.set(type, listener),
      skipWaiting: () => {},
      clients: { claim: () => {} },
      location: { origin: "https://app.dumosrx.test" },
    } as Record<string, unknown>;
    const internals = new Function(
      "self",
      `${source}\nreturn self.__swInternals;`,
    )(stubSelf) as { NAVIGATE_NETWORK_TIMEOUT_MS?: number };
    return { internals, listeners };
  };

  const htmlResponse = (body: string) => ({
    headers: { get: () => "text/html; charset=utf-8" },
    clone: () => htmlResponse(body),
    body,
  });

  let cacheEntries: Map<string, unknown>;
  let fetchCalls: { signal: AbortSignal }[];

  beforeEach(() => {
    vi.useFakeTimers();
    cacheEntries = new Map<string, unknown>([
      ["https://app.dumosrx.test/pos", htmlResponse("cached-pos")],
    ]);
    fetchCalls = [];
    (globalThis as Record<string, unknown>).caches = {
      open: () =>
        Promise.resolve({
          match: (key: { url?: string } | string) =>
            Promise.resolve(cacheEntries.get(typeof key === "string" ? key : (key.url ?? ""))),
          put: (key: { url: string }, response: unknown) =>
            Promise.resolve(cacheEntries.set(key.url, response)),
        }),
    };
    (globalThis as Record<string, unknown>).fetch = (
      _request: unknown,
      init: { signal: AbortSignal },
    ) => {
      fetchCalls.push(init);
      return new Promise((_resolve, reject) => {
        init.signal.addEventListener("abort", () =>
          reject(new DOMException("Aborted", "AbortError")),
        );
      });
    };
  });

  afterEach(() => {
    vi.useRealTimers();
    delete (globalThis as Record<string, unknown>).caches;
    delete (globalThis as Record<string, unknown>).fetch;
  });

  const respondToNavigation = (listeners: Map<string, (event: unknown) => void>) => {
    const handleFetch = listeners.get("fetch");
    if (!handleFetch) throw new Error("sw.js registered no fetch listener");
    let responded: Promise<unknown> | undefined;
    handleFetch({
      request: {
        method: "GET",
        mode: "navigate",
        url: "https://app.dumosrx.test/pos",
      },
      respondWith: (promise: Promise<unknown>) => {
        responded = promise;
      },
    });
    if (!responded) throw new Error("navigate request was never answered");
    return responded;
  };

  it("exposes a navigate timeout with real headroom for a congested mobile connection", () => {
    const { internals } = loadServiceWorker();

    expect(internals.NAVIGATE_NETWORK_TIMEOUT_MS).toBeGreaterThanOrEqual(8000);
    expect(internals.NAVIGATE_NETWORK_TIMEOUT_MS).toBeLessThanOrEqual(12000);
  });

  it("has not given up on the network after 7 seconds", async () => {
    const { listeners } = loadServiceWorker();
    const responded = respondToNavigation(listeners);
    const settled = vi.fn();
    void responded.then(settled, settled);

    await vi.advanceTimersByTimeAsync(7000);

    expect(fetchCalls).toHaveLength(1);
    expect(fetchCalls[0].signal.aborted).toBe(false);
    expect(settled).not.toHaveBeenCalled();
  });

  it("still aborts and falls back to cache well before a dead connection stalls the page", async () => {
    const { internals, listeners } = loadServiceWorker();
    const responded = respondToNavigation(listeners);

    expect(internals.NAVIGATE_NETWORK_TIMEOUT_MS).toBeDefined();
    await vi.advanceTimersByTimeAsync(internals.NAVIGATE_NETWORK_TIMEOUT_MS ?? 0);

    expect(fetchCalls[0].signal.aborted).toBe(true);
    await expect(responded).resolves.toMatchObject({ body: "cached-pos" });
  });
});
