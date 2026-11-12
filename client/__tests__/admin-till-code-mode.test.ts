import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { renderHook, act } from "@testing-library/react";

const { lookup } = vi.hoisted(() => ({
  lookup: { rows: [] as unknown[], calls: [] as string[] },
}));

vi.mock("@/lib/db/queries/auth", () => ({
  getUsersByUsernameOrEmail: vi.fn((identifier: string) => {
    lookup.calls.push(identifier);
    return Promise.resolve(lookup.rows);
  }),
}));

import { useAdminTillCodeMode } from "@/lib/hooks/use-admin-till-code-mode";

describe("useAdminTillCodeMode", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    lookup.rows = [];
    lookup.calls = [];
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("stays off for a plain username, with no database lookup at all", async () => {
    const { result } = renderHook(() => useAdminTillCodeMode("cashier1"));

    await act(async () => {
      await vi.advanceTimersByTimeAsync(400);
    });

    expect(result.current).toBe(false);
    expect(lookup.calls).toEqual([]);
  });

  it("turns on for an email matching no local user after debounce", async () => {
    const { result } = renderHook(() => useAdminTillCodeMode("ops@dumosrx.com"));

    await act(async () => {
      await vi.advanceTimersByTimeAsync(200);
    });
    expect(lookup.calls).toEqual([]);
    expect(result.current).toBe(false);

    await act(async () => {
      await vi.advanceTimersByTimeAsync(200);
    });
    expect(lookup.calls).toEqual(["ops@dumosrx.com"]);
    expect(result.current).toBe(true);
  });

  it("stays off for an email that IS a local user, so the owner keeps their PIN login", async () => {
    lookup.rows = [{ id: "u1" }];

    const { result } = renderHook(() => useAdminTillCodeMode("owner@shop.com"));

    await act(async () => {
      await vi.advanceTimersByTimeAsync(400);
    });

    expect(result.current).toBe(false);
  });

  it("turns back off when the identifier stops looking like an email", async () => {
    const { result, rerender } = renderHook(
      ({ id }) => useAdminTillCodeMode(id),
      { initialProps: { id: "ops@dumosrx.com" } },
    );

    await act(async () => {
      await vi.advanceTimersByTimeAsync(400);
    });
    expect(result.current).toBe(true);

    rerender({ id: "cashier1" });

    expect(result.current).toBe(false);
  });

  it("answers false rather than throwing when the lookup fails", async () => {
    const auth = await import("@/lib/db/queries/auth");
    vi.mocked(auth.getUsersByUsernameOrEmail).mockRejectedValueOnce(
      new Error("no database"),
    );

    const { result } = renderHook(() => useAdminTillCodeMode("ops@dumosrx.com"));

    await act(async () => {
      await vi.advanceTimersByTimeAsync(400);
    });

    expect(result.current).toBe(false);
  });

  it("does not flip while an email is still being typed", async () => {
    const { result } = renderHook(() => useAdminTillCodeMode("josh@gm"));

    await act(async () => {
      await vi.advanceTimersByTimeAsync(400);
    });

    expect(result.current).toBe(false);
    expect(lookup.calls).toEqual([]);
  });
});
