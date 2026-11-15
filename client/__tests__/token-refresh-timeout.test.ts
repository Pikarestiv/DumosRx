import { afterEach, describe, expect, it, vi } from "vitest";

import { REFRESH_RETRY_DELAY_MS, REFRESH_TIMEOUT_MS, getToken, refreshTokenSilently, setToken } from "@/lib/api/token-manager";

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

  it("retries a 401 once and keeps the token when the retry succeeds", async () => {
    vi.useFakeTimers();
    setToken("till-token");
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(new Response("{}", { status: 401 }))
      .mockResolvedValueOnce(new Response(JSON.stringify({ token: "new-token" }), { status: 200 }));
    vi.stubGlobal("fetch", fetchMock);

    const outcome = refreshTokenSilently("https://api.test");
    await vi.advanceTimersByTimeAsync(REFRESH_RETRY_DELAY_MS);

    expect(await outcome).toBe("refreshed");
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(getToken()).toBe("new-token");
  });

  it("keeps the token when the device goes offline during the retry", async () => {
    vi.useFakeTimers();
    setToken("till-token");
    const fetchMock = vi.fn().mockResolvedValueOnce(new Response("{}", { status: 401 })).mockRejectedValueOnce(new TypeError("Failed to fetch"));
    vi.stubGlobal("fetch", fetchMock);

    const outcome = refreshTokenSilently("https://api.test");
    await vi.advanceTimersByTimeAsync(REFRESH_RETRY_DELAY_MS);

    expect(await outcome).toBe("unconfirmed");
    expect(getToken()).toBe("till-token");
  });

  it("unlinks only after the retry is also refused", async () => {
    vi.useFakeTimers();
    setToken("till-token");
    const fetchMock = vi.fn().mockImplementation(() => Promise.resolve(new Response("{}", { status: 401 })));
    vi.stubGlobal("fetch", fetchMock);

    const outcome = refreshTokenSilently("https://api.test");
    await vi.advanceTimersByTimeAsync(REFRESH_RETRY_DELAY_MS);

    expect(await outcome).toBe("confirmed-invalid");
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(getToken()).toBeNull();
  });
});
