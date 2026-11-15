import { afterEach, describe, expect, it, vi } from "vitest";

import { REFRESH_TIMEOUT_MS, getToken, refreshTokenSilently, setToken } from "@/lib/api/token-manager";

describe("silent token refresh timeout", () => {
  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
  });

  it("waits the full timeout, then gives up without unlinking the till", async () => {
    vi.useFakeTimers();
    setToken("till-token");
    let signal: AbortSignal | undefined;
    vi.stubGlobal(
      "fetch",
      vi.fn((_url: string, init: RequestInit) => {
        signal = init.signal as AbortSignal;
        return new Promise((_resolve, reject) => signal?.addEventListener("abort", () => reject(new DOMException("aborted", "AbortError"))));
      }),
    );

    const outcome = refreshTokenSilently("https://api.test");
    await vi.advanceTimersByTimeAsync(REFRESH_TIMEOUT_MS - 1);
    expect(signal?.aborted).toBe(false);

    await vi.advanceTimersByTimeAsync(1);
    expect(await outcome).toBe("unconfirmed");
    expect(getToken()).toBe("till-token");
  });
});
