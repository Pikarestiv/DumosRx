import { describe, it, expect, vi, beforeEach } from "vitest";
import { renderHook, act } from "@testing-library/react";

const { consumeRelinkCode, setToken, clearImpersonatedSession, setStoredUser } = vi.hoisted(() => ({
  consumeRelinkCode: vi.fn(),
  setToken: vi.fn(),
  clearImpersonatedSession: vi.fn(),
  setStoredUser: vi.fn(),
}));

vi.mock("@/lib/api/client", () => ({ apiClient: { consumeRelinkCode, setToken, login: vi.fn() } }));
vi.mock("@/lib/utils/impersonation", () => ({ clearImpersonatedSession }));
vi.mock("@/lib/storage-keys", () => ({ setStoredUser }));

import { useCloudLink } from "@/lib/hooks/use-cloud-link";

const localUser = {
  id: "u1",
  first_name: "Ada",
  last_name: "O",
  username: "ada",
  email: "ada@local.test",
  role: "manager" as const,
};

function setup() {
  const deps = {
    user: localUser,
    setUser: vi.fn(),
    setIsCloudLinked: vi.fn(),
    setIsImpersonating: vi.fn(),
  };
  const { result } = renderHook(() => useCloudLink(deps));
  return { deps, result };
}

describe("useCloudLink().linkWithRelinkCode", () => {
  beforeEach(() => vi.clearAllMocks());

  it("adopts the token and marks the till linked without rewriting the local user's email", async () => {
    consumeRelinkCode.mockResolvedValue({ token: "new-token", user: { email: "owner@cloud.test" } });
    const { deps, result } = setup();

    let outcome;
    await act(async () => {
      outcome = await result.current.linkWithRelinkCode(" abcd2345 ");
    });

    expect(outcome).toEqual({ success: true, message: expect.any(String) });
    expect(consumeRelinkCode).toHaveBeenCalledWith("ABCD2345");
    expect(setToken).toHaveBeenCalledWith("new-token");
    expect(deps.setIsCloudLinked).toHaveBeenCalledWith(true);
    expect(clearImpersonatedSession).toHaveBeenCalled();
    expect(deps.setIsImpersonating).toHaveBeenCalledWith(false);
    expect(deps.setUser).not.toHaveBeenCalled();
    expect(setStoredUser).not.toHaveBeenCalled();
  });

  it("returns the server's message and leaves the till unlinked when the code is refused", async () => {
    consumeRelinkCode.mockRejectedValue(new Error("Invalid or expired code."));
    const { deps, result } = setup();

    let outcome;
    await act(async () => {
      outcome = await result.current.linkWithRelinkCode("ZZZZZZZZ");
    });

    expect(outcome).toEqual({ success: false, message: "Invalid or expired code." });
    expect(setToken).not.toHaveBeenCalled();
    expect(deps.setIsCloudLinked).not.toHaveBeenCalled();
  });
});
