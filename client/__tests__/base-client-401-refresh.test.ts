import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { apiClient } from "../lib/api/client";
import { setToken, clearToken, getToken } from "../lib/api/token-manager";

// Regression coverage for base-client.ts's 401 handler clearing the auth token on a network blip during the refresh-and-re…
// Rationale: docs/CLIENT_COMMENTS.md#block-__tests__-base-client-401-refresh-test-ts-L5
describe("BaseApiClient 401 handling", () => {
  const originalFetch = global.fetch;

  beforeEach(() => {
    global.fetch = vi.fn();
    setToken("initial-token");
    localStorage.removeItem("auth_token_issued_at"); // skip the proactive 7-day refresh check
  });

  afterEach(() => {
    global.fetch = originalFetch;
    clearToken();
  });

  it("does NOT clear the token when the refresh attempt can't confirm invalidity (network error)", async () => {
    const fetchMock = global.fetch as ReturnType<typeof vi.fn>;
    fetchMock
      .mockResolvedValueOnce({
        ok: false,
        status: 401,
        json: async () => ({ message: "Unauthenticated" }),
        text: async () => JSON.stringify({ message: "Unauthenticated" }),
      })
      .mockRejectedValueOnce(new Error("network error"));

    await expect(apiClient.getProfile()).rejects.toThrow();

    expect(getToken()).toBe("initial-token");
  });

  it("does NOT clear the token when the refresh attempt gets a non-auth failure status", async () => {
    const fetchMock = global.fetch as ReturnType<typeof vi.fn>;
    fetchMock
      .mockResolvedValueOnce({
        ok: false,
        status: 401,
        json: async () => ({ message: "Unauthenticated" }),
        text: async () => JSON.stringify({ message: "Unauthenticated" }),
      })
      .mockResolvedValueOnce({
        ok: false,
        status: 502,
        json: async () => ({ message: "Bad Gateway" }),
        text: async () => JSON.stringify({ message: "Bad Gateway" }),
      });

    await expect(apiClient.getProfile()).rejects.toThrow();

    expect(getToken()).toBe("initial-token");
  });

  it("clears the token when the refresh attempt gets a definitive 401", async () => {
    const fetchMock = global.fetch as ReturnType<typeof vi.fn>;
    fetchMock
      .mockResolvedValueOnce({
        ok: false,
        status: 401,
        json: async () => ({ message: "Unauthenticated" }),
        text: async () => JSON.stringify({ message: "Unauthenticated" }),
      })
      .mockResolvedValueOnce({
        ok: false,
        status: 401,
        json: async () => ({ message: "Invalid refresh token" }),
        text: async () => JSON.stringify({ message: "Invalid refresh token" }),
      });

    await expect(apiClient.getProfile()).rejects.toThrow();

    expect(getToken()).toBeNull();
  });

  it("retries the original request once with the new token when the refresh succeeds", async () => {
    const fetchMock = global.fetch as ReturnType<typeof vi.fn>;
    fetchMock
      .mockResolvedValueOnce({
        ok: false,
        status: 401,
        json: async () => ({ message: "Unauthenticated" }),
        text: async () => JSON.stringify({ message: "Unauthenticated" }),
      })
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({ token: "fresh-token" }),
        text: async () => JSON.stringify({ token: "fresh-token" }),
      })
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({ id: "u1", name: "Test User" }),
        text: async () => JSON.stringify({ id: "u1", name: "Test User" }),
      });

    const result = await apiClient.getProfile();

    expect(result).toEqual({ id: "u1", name: "Test User" });
    expect(getToken()).toBe("fresh-token");
    expect(fetchMock).toHaveBeenCalledTimes(3);
    const retryCall = fetchMock.mock.calls[2];
    expect(retryCall[1].headers.Authorization).toBe("Bearer fresh-token");
  });
});
