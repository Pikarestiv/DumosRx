import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { apiClient } from "../lib/api/client";
import { setToken, clearToken } from "../lib/api/token-manager";

/**
 * A-171. `SyntaxError: Unexpected token '<'` — 260 events across 4 stores,
 * marked fatal, with no stacktrace and no `area` tag, so the call site could
 * not be identified from Sentry at all.
 *
 * The cause is an asymmetry in base-client.ts: the error path parses with
 * `.json().catch(() => ({}))`, but the success path called `.json()`
 * unguarded. A 2xx carrying HTML — a shared-host error page, a maintenance
 * interstitial, a proxy login wall — therefore threw a bare SyntaxError that
 * named nothing about where it came from.
 *
 * The fix is not just "don't throw": it is to throw something that identifies
 * itself, so the next occurrence is diagnosable from the report alone.
 */
describe("BaseApiClient non-JSON responses", () => {
  const originalFetch = global.fetch;

  beforeEach(() => {
    global.fetch = vi.fn();
    setToken("tok");
    localStorage.removeItem("auth_token_issued_at");
  });

  afterEach(() => {
    global.fetch = originalFetch;
    clearToken();
  });

  const htmlResponse = (body: string) => ({
    ok: true,
    status: 200,
    headers: { get: (h: string) => (h.toLowerCase() === "content-type" ? "text/html" : null) },
    json: async () => {
      throw new SyntaxError("Unexpected token '<', \"<!DOCTYPE \"... is not valid JSON");
    },
    text: async () => body,
  });

  it("does not surface a bare SyntaxError for an HTML body", async () => {
    (global.fetch as ReturnType<typeof vi.fn>).mockResolvedValueOnce(
      htmlResponse("<!DOCTYPE html><html><body>503 Service Unavailable</body></html>"),
    );

    await expect(apiClient.getProfile()).rejects.toThrow(/not valid JSON|non-JSON|HTML/i);

    await expect(
      (async () => {
        (global.fetch as ReturnType<typeof vi.fn>).mockResolvedValueOnce(
          htmlResponse("<!DOCTYPE html><html></html>"),
        );
        try {
          await apiClient.getProfile();
        } catch (e) {
          return (e as Error).name;
        }
        return "no-throw";
      })(),
    ).resolves.not.toBe("SyntaxError");
  });

  /** The whole point: the next occurrence must name its own call site. */
  it("names the endpoint and the status in the error", async () => {
    (global.fetch as ReturnType<typeof vi.fn>).mockResolvedValueOnce(
      htmlResponse("<!DOCTYPE html><html><body>maintenance</body></html>"),
    );

    let message = "";
    try {
      await apiClient.getProfile();
    } catch (e) {
      message = (e as Error).message;
    }

    expect(message).toMatch(/\/user/);
    expect(message).toMatch(/200/);
  });

  it("still parses a normal JSON response", async () => {
    (global.fetch as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
      ok: true,
      status: 200,
      headers: { get: () => "application/json" },
      json: async () => ({ ok: true, value: 42 }),
      text: async () => '{"ok":true,"value":42}',
    });

    await expect(apiClient.getProfile()).resolves.toMatchObject({ value: 42 });
  });
});
