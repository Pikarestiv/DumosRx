import { describe, it, expect, beforeEach, vi, afterEach } from "vitest";
import {
  shouldAttemptAdminTillLogin,
  requestAdminTillSession,
  endAdminTillSession,
} from "@/lib/api/admin-till-session";

/**
 * The discriminator decides, locally and with no secret in the bundle, whether
 * a login attempt is an admin one. Getting it wrong in either direction is
 * severe: too eager and a store owner cannot sign in to their own till
 * offline; too shy and an admin can never get in at all.
 */
describe("shouldAttemptAdminTillLogin", () => {
  it("attempts the admin path for an email matching no user on this device", () => {
    expect(shouldAttemptAdminTillLogin("ops@dumosrx.com", 0)).toBe(true);
  });

  it("never attempts it for a plain username", () => {
    expect(shouldAttemptAdminTillLogin("cashier1", 0)).toBe(false);
  });

  it("leaves a store owner signing in with their own email to the offline login", () => {
    // The owner's email IS on a local user row, so this must stay local and
    // never reach the network — a till with no internet must still open.
    expect(shouldAttemptAdminTillLogin("owner@shop.com", 1)).toBe(false);
  });

  it("falls through to the PIN login when an admin email is also a local user", () => {
    // Documented constraint: such an admin must use an email that is not on
    // any local user record.
    expect(shouldAttemptAdminTillLogin("ops@dumosrx.com", 1)).toBe(false);
  });

  it("ignores surrounding whitespace", () => {
    expect(shouldAttemptAdminTillLogin("  ops@dumosrx.com ", 0)).toBe(true);
  });

  it("sends a deactivated owner's email online rather than failing locally", () => {
    // getUsersByUsernameOrEmail filters `is_active = 1 AND _deleted = 0`, so a
    // deactivated owner matches nothing locally and reaches the admin path,
    // failing with the uniform message. Pinned so it is deliberate.
    expect(shouldAttemptAdminTillLogin("deactivated@shop.com", 0)).toBe(true);
  });
});

describe("requestAdminTillSession", () => {
  beforeEach(() => {
    localStorage.clear();
    localStorage.setItem("dumos_device_id", "till-7");
    localStorage.setItem("dumos_active_store_id", "store-1");
  });

  afterEach(() => vi.unstubAllGlobals());

  it("leaves the till's own auth token intact when the code is wrong", async () => {
    // base-client would refresh-and-clear on a 401; this endpoint must not go
    // anywhere near that path.
    localStorage.setItem("auth_token", "till-token");
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => new Response("{}", { status: 401 })),
    );

    const session = await requestAdminTillSession("ops@dumosrx.com", "000000000000");

    expect(session).toBeNull();
    expect(localStorage.getItem("auth_token")).toBe("till-token");
  });

  it("sends no Authorization header", async () => {
    localStorage.setItem("auth_token", "till-token");
    const fetchMock = vi.fn(
      async (_url: string, _init?: RequestInit) => new Response("{}", { status: 401 }),
    );
    vi.stubGlobal("fetch", fetchMock);

    await requestAdminTillSession("ops@dumosrx.com", "000000000000");

    const headers = (fetchMock.mock.calls[0][1]?.headers ?? {}) as Record<string, string>;
    expect(Object.keys(headers).map((k) => k.toLowerCase())).not.toContain("authorization");
  });

  it("derives both deadlines from this device's clock, not the server's timestamp", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(
        async () =>
          new Response(
            JSON.stringify({
              session_id: "sess-1",
              expires_in: 14400,
              // Four hours BEHIND this device: a till whose clock runs fast.
              expires_at: new Date(Date.now() - 4 * 3600 * 1000).toISOString(),
              admin: { id: "a1", email: "ops@dumosrx.com", role: "platform_admin" },
            }),
            { status: 200 },
          ),
      ),
    );

    const session = await requestAdminTillSession("ops@dumosrx.com", "123456789012");

    expect(session).not.toBeNull();
    // Had we trusted the server's absolute expires_at, this session would be
    // dead on arrival and the admin would see nothing with no error.
    expect(new Date(session!.hardExpiresAt).getTime()).toBeGreaterThan(Date.now());
    expect(session!.sessionId).toBe("sess-1");
    expect(session!.storeId).toBe("store-1");
  });

  it("returns null rather than throwing when the server answers without a session", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => new Response(JSON.stringify({ ok: true }), { status: 200 })),
    );

    await expect(
      requestAdminTillSession("ops@dumosrx.com", "123456789012"),
    ).resolves.toBeNull();
  });
});

describe("endAdminTillSession", () => {
  afterEach(() => vi.unstubAllGlobals());

  it("swallows a network failure, so exiting is never blocked by one", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => { throw new Error("offline"); }));

    await expect(endAdminTillSession("sess-1", "idle")).resolves.toBeUndefined();
  });
});
