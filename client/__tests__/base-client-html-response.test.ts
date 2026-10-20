import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { apiClient } from "../lib/api/client";
import { setToken, clearToken } from "../lib/api/token-manager";

// A-171. `SyntaxError: Unexpected token '<'` — 260 events across 4 stores, marked fatal, with no stacktrace and no `area`…
// Rationale: docs/CLIENT_COMMENTS.md#block-__tests__-base-client-html-response-test-ts-L5
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

  // A-206. The error named the endpoint, status and content-type, and stopped there — which could not separate the three cau…
  // Rationale: docs/CLIENT_COMMENTS.md#block-__tests__-base-client-html-response-test-ts-L94
  it("reports the body length, its ends and the failure kind", async () => {
    const body = `{"success":true,"data":[${"0,".repeat(80)}`;
    (global.fetch as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
      ok: true,
      status: 200,
      headers: {
        get: (h: string) =>
          h.toLowerCase() === "content-type" ? "application/json" : null,
      },
      json: async () => {
        throw new SyntaxError("Unexpected end of JSON input");
      },
      text: async () => body,
    });

    let message = "";
    try {
      await apiClient.getProfile();
    } catch (e) {
      message = (e as Error).message;
    }

    expect(message).toMatch(new RegExp(`${body.length} bytes`));
    expect(message).toMatch(/SyntaxError/);
    // Excerpts are JSON.stringify'd so whitespace and truncation points are
    // visible rather than invisible.
    expect(message).toMatch(/starts .*success/);
    expect(message).toMatch(/ends /);
  });

  /** A body that cannot even be read as text must still produce the useful
   * error rather than throwing out of the error handler itself. */
  it("still names the endpoint when the body cannot be read", async () => {
    (global.fetch as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
      ok: true,
      status: 200,
      headers: { get: () => "application/json" },
      json: async () => {
        throw new TypeError("Failed to fetch");
      },
      text: async () => {
        throw new TypeError("body stream already read");
      },
    });

    let message = "";
    try {
      await apiClient.getProfile();
    } catch (e) {
      message = (e as Error).message;
    }

    expect(message).toMatch(/\/user/);
    expect(message).toMatch(/TypeError/);
  });
});
