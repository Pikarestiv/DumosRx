import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { onlineManager, QueryObserver } from "@tanstack/react-query";
import { queryClient } from "@/lib/query-client";

describe("shared query client while the browser reports offline", () => {
  beforeEach(() => {
    queryClient.clear();
    queryClient.mount();
    onlineManager.setOnline(false);
  });

  afterEach(() => {
    onlineManager.setOnline(true);
    vi.useRealTimers();
    queryClient.unmount();
    queryClient.clear();
  });

  it("still runs a local-database query that has never loaded", async () => {
    const queryFn = vi.fn().mockResolvedValue(["row"]);
    const observer = new QueryObserver(queryClient, { queryKey: ["local-read"], queryFn });
    const unsubscribe = observer.subscribe(() => {});

    await vi.waitFor(() => expect(observer.getCurrentResult().data).toEqual(["row"]));
    expect(queryFn).toHaveBeenCalledTimes(1);
    unsubscribe();
  });

  it("tries a network query once, then holds its retries until the browser is back online", async () => {
    vi.useFakeTimers();
    const queryFn = vi.fn().mockRejectedValue(new Error("Failed to fetch"));
    const observer = new QueryObserver(queryClient, { queryKey: ["network-read"], queryFn });
    const unsubscribe = observer.subscribe(() => {});

    await vi.advanceTimersByTimeAsync(60_000);
    expect(queryFn).toHaveBeenCalledTimes(1);
    expect(observer.getCurrentResult().fetchStatus).toBe("paused");

    onlineManager.setOnline(true);
    await vi.advanceTimersByTimeAsync(10_000);
    expect(queryFn.mock.calls.length).toBeGreaterThan(1);
    unsubscribe();
  });
});
