import { describe, it, expect, vi, beforeEach } from "vitest";

const invokeMock = vi.fn();
vi.mock("@tauri-apps/api/core", () => ({ invoke: (...args: unknown[]) => invokeMock(...args) }));
vi.mock("@/lib/db", () => ({ isTauri: () => true }));

describe("widget-bridge token mirroring", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    localStorage.clear();
    vi.resetModules();
  });

  it("setToken invokes mirror_auth_token with the new token when running under Tauri", async () => {
    const { setToken } = await import("@/lib/api/token-manager");
    setToken("abc123");
    // setToken doesn't await the mirror call (fire-and-forget), so flush microtasks.
    await Promise.resolve();
    expect(invokeMock).toHaveBeenCalledWith("mirror_auth_token", { token: "abc123" });
  });

  it("clearToken invokes clear_mirrored_auth_token", async () => {
    const { clearToken } = await import("@/lib/api/token-manager");
    clearToken();
    await Promise.resolve();
    expect(invokeMock).toHaveBeenCalledWith("clear_mirrored_auth_token", undefined);
  });
});
