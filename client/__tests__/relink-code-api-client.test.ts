import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { apiClient } from "../lib/api/client";

describe("till re-link code API methods", () => {
  const originalFetch = global.fetch;

  beforeEach(() => {
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      headers: new Headers({ "content-type": "application/json" }),
      json: () => Promise.resolve({ token: "t", user: { id: "u" }, message: "ok", code: "ABCD2345", expires_at: "x" }),
    });
    localStorage.setItem("dumos_active_store_id", "store-123");
  });

  afterEach(() => {
    global.fetch = originalFetch;
    localStorage.clear();
  });

  it("consumeRelinkCode posts the code with the till's X-Store-Id header", async () => {
    await apiClient.consumeRelinkCode("ABCD2345");

    const [url, config] = (global.fetch as ReturnType<typeof vi.fn>).mock.calls[0];
    expect(url).toMatch(/\/app\/relink-code\/consume$/);
    expect(config.method).toBe("POST");
    expect(JSON.parse(config.body)).toEqual({ code: "ABCD2345" });
    expect(config.headers["X-Store-Id"]).toBe("store-123");
    expect(config.headers["X-Device-Label"]).toBeTruthy();
  });

  it("generateRelinkCode posts the store id", async () => {
    const result = await apiClient.generateRelinkCode("store-123");

    const [url, config] = (global.fetch as ReturnType<typeof vi.fn>).mock.calls[0];
    expect(url).toMatch(/\/app\/relink-code$/);
    expect(JSON.parse(config.body)).toEqual({ store_id: "store-123" });
    expect(result.code).toBe("ABCD2345");
  });
});
