import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { apiClient } from "@/lib/api/client";
import { APP_VERSION } from "@/lib/constants";

/**
 * A-213: the server refuses Health Sync from a client that cannot prove its
 * version, so every sync call must carry one. Dropping this header would
 * silently disable the endpoint for every device.
 */
describe("syncHeaders", () => {
  beforeEach(() => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: true,
        status: 200,
        headers: new Headers({ "content-type": "application/json" }),
        json: async () => ({ success: true, counts: {} }),
      }),
    );
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("stamps the app version and build on a sync call", async () => {
    await apiClient.getSyncCounts();

    const [, config] = vi.mocked(fetch).mock.calls[0] as [
      string,
      { headers: Record<string, string> },
    ];

    expect(config.headers["X-App-Version"]).toBe(APP_VERSION);
    expect(config.headers["X-Build-Sha"]).toBeTruthy();
  });
});
