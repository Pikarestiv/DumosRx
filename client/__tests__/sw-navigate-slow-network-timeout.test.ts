import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

/**
 * A-160: the navigate handler's "network first" fetch was bounded by a flat
 * 4000ms abort, chosen only to stop iOS Safari parking a doomed fetch for
 * tens of seconds. On a congested Nigerian mobile connection that budget
 * also expired before a perfectly live request could deliver the document's
 * first byte, so the device fell back to Cache Storage on every single
 * navigation and never landed a fresh copy - the other half of the stale
 * deploy loop A-159 fixed in the HTTP-cache layer (Sentry DUMOSRX-CLIENT-F /
 * DUMOSRX-CLIENT-J). These cases pin the headroom the slow connection needs
 * and the upper bound that still protects the dead-connection case.
 */
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
    // eslint-disable-next-line @typescript-eslint/no-implied-eval
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
      open: async () => ({
        match: async (key: { url?: string } | string) =>
          cacheEntries.get(typeof key === "string" ? key : (key.url ?? "")),
        put: async (key: { url: string }, response: unknown) =>
          cacheEntries.set(key.url, response),
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
    let responded: Promise<unknown> | undefined;
    listeners.get("fetch")!({
      request: {
        method: "GET",
        mode: "navigate",
        url: "https://app.dumosrx.test/pos",
      },
      respondWith: (promise: Promise<unknown>) => {
        responded = promise;
      },
    });
    return responded!;
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

    await vi.advanceTimersByTimeAsync(internals.NAVIGATE_NETWORK_TIMEOUT_MS!);

    expect(fetchCalls[0].signal.aborted).toBe(true);
    await expect(responded).resolves.toMatchObject({ body: "cached-pos" });
  });
});
