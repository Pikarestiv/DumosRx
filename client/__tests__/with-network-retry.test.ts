import { describe, it, expect, vi } from "vitest";
import { withNetworkRetry } from "@/lib/api/retry-on-network-error";

function networkError(message = "Failed to fetch") {
  return new Error(message);
}

function httpError(status: number, message = "The email has already been taken.") {
  const err = new Error(message) as Error & { status?: number };
  err.status = status;
  return err;
}

describe("withNetworkRetry", () => {
  it("returns the result immediately on first success, no retries", async () => {
    const fn = vi.fn(async () => "ok");
    const result = await withNetworkRetry(fn, { baseDelayMs: 1 });
    expect(result).toBe("ok");
    expect(fn).toHaveBeenCalledTimes(1);
  });

  it("retries a network error (no .status) up to the attempt limit, then succeeds", async () => {
    const fn = vi
      .fn()
      .mockRejectedValueOnce(networkError())
      .mockRejectedValueOnce(networkError())
      .mockResolvedValueOnce("recovered");

    const result = await withNetworkRetry(fn, { attempts: 3, baseDelayMs: 1 });
    expect(result).toBe("recovered");
    expect(fn).toHaveBeenCalledTimes(3);
  });

  it("gives up and throws after exhausting all attempts on persistent network errors", async () => {
    const fn = vi.fn().mockRejectedValue(networkError("timed out"));

    await expect(withNetworkRetry(fn, { attempts: 3, baseDelayMs: 1 })).rejects.toThrow("timed out");
    expect(fn).toHaveBeenCalledTimes(3);
  });

  it("never retries an HTTP error (a real response with a .status), even a 5xx", async () => {
    const fn = vi.fn().mockRejectedValue(httpError(500, "Internal Server Error"));

    await expect(withNetworkRetry(fn, { attempts: 3, baseDelayMs: 1 })).rejects.toThrow("Internal Server Error");
    expect(fn).toHaveBeenCalledTimes(1);
  });

  it("never retries a 422 validation error", async () => {
    const fn = vi.fn().mockRejectedValue(httpError(422));

    await expect(withNetworkRetry(fn, { attempts: 3, baseDelayMs: 1 })).rejects.toThrow(
      "The email has already been taken.",
    );
    expect(fn).toHaveBeenCalledTimes(1);
  });
});
