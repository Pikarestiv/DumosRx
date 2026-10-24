import { describe, it, expect, vi, beforeEach } from "vitest";
import { renderHook, waitFor } from "@testing-library/react";

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

// If this never flips, the admin cannot submit at all:
// Rationale: docs/CLIENT_COMMENTS.md#block-__tests__-admin-till-code-mode-test-ts-L17
describe("useAdminTillCodeMode", () => {
  beforeEach(() => {
    lookup.rows = [];
    lookup.calls = [];
  });

  it("stays off for a plain username, with no database lookup at all", async () => {
    const { result } = renderHook(() => useAdminTillCodeMode("cashier1"));

    await new Promise((resolve) => setTimeout(resolve, 600));

    expect(result.current).toBe(false);
    expect(lookup.calls).toEqual([]);
  });

  it("turns on for an email matching no local user", async () => {
    const { result } = renderHook(() => useAdminTillCodeMode("ops@dumosrx.com"));

    await waitFor(() => expect(result.current).toBe(true), { timeout: 2000 });
  });

  it("stays off for an email that IS a local user, so the owner keeps their PIN login", async () => {
    lookup.rows = [{ id: "u1" }];

    const { result } = renderHook(() => useAdminTillCodeMode("owner@shop.com"));

    await new Promise((resolve) => setTimeout(resolve, 600));

    expect(result.current).toBe(false);
  });

  it("turns back off when the identifier stops looking like an email", async () => {
    const { result, rerender } = renderHook(
      ({ id }) => useAdminTillCodeMode(id),
      { initialProps: { id: "ops@dumosrx.com" } },
    );

    await waitFor(() => expect(result.current).toBe(true), { timeout: 2000 });

    rerender({ id: "cashier1" });

    await waitFor(() => expect(result.current).toBe(false));
  });

  it("answers false rather than throwing when the lookup fails", async () => {
    const auth = await import("@/lib/db/queries/auth");
    vi.mocked(auth.getUsersByUsernameOrEmail).mockRejectedValueOnce(
      new Error("no database"),
    );

    const { result } = renderHook(() => useAdminTillCodeMode("ops@dumosrx.com"));

    await new Promise((resolve) => setTimeout(resolve, 600));

    expect(result.current).toBe(false);
  });

  it("does not flip while an email is still being typed", async () => {
    const { result } = renderHook(() => useAdminTillCodeMode("josh@gm"));

    await new Promise((resolve) => setTimeout(resolve, 600));

    expect(result.current).toBe(false);
    // No point querying for something that cannot be a login identifier yet.
    expect(lookup.calls).toEqual([]);
  });
});
