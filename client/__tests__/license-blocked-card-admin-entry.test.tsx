import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { LicenseBlockedCard } from "@/components/auth/license-blocked-card";
import {
  startTillInspectionSession,
  IDLE_TIMEOUT_MS,
  type TillInspectionSession,
} from "@/lib/utils/till-inspection";

const { overrides } = vi.hoisted(() => ({ overrides: { calls: 0 } }));

vi.mock("@/lib/licensing/licensing-manager", () => ({
  overrideClockLockout: vi.fn(async () => {
    overrides.calls += 1;
    return { ok: true, reason: "done" };
  }),
}));

vi.mock("sonner", () => ({ toast: { success: vi.fn(), error: vi.fn() } }));

// The card now mounts TillInspectionBanner, which reads useStore(). In the app
// StoreProvider sits above LicenseGuard in the root layout; here it does not.
vi.mock("@/lib/context/store-context", () => ({
  useStore: () => ({ storeProfile: { id: "s1", name: "Agidi Branch" } }),
}));

vi.mock("@/lib/api/admin-till-session", () => ({
  endAdminTillSession: vi.fn(async () => {}),
  beaconAdminTillSessionEnd: vi.fn(),
  readInspectionServerClock: vi.fn(async () => new Date()),
  requestAdminTillSession: vi.fn(async () => null),
  TILL_CODE_LENGTH: 12,
  UNIFORM_REJECTION: "Wrong password.",
  OFFLINE_MESSAGE: "Admin access needs an internet connection.",
}));

const live = (): TillInspectionSession => ({
  admin: {
    id: "a1",
    first_name: "Ops",
    last_name: "Admin",
    email: "ops@dumosrx.com",
    role: "platform_admin",
  },
  sessionId: "sess-1",
  hardExpiresAt: new Date(Date.now() + 4 * 3600 * 1000).toISOString(),
  idleExpiresAt: new Date(Date.now() + IDLE_TIMEOUT_MS).toISOString(),
  storeId: "s1",
  deviceId: "till-7",
});

const tampered = {
  isValid: false,
  isClockTampered: true,
  isSuspended: false,
  message: "System clock discrepancy detected.",
} as never;

/**
 * This card replaces the WHOLE app — LicenseGuard returns it instead of its
 * children — so without an admin entry here a clock-tampered till could never
 * be unlocked by an admin standing in front of it. It is the one path in this
 * feature with no fallback.
 */
describe("LicenseBlockedCard admin entry", () => {
  beforeEach(() => {
    sessionStorage.clear();
    overrides.calls = 0;
  });

  const renderCard = () =>
    render(
      <LicenseBlockedCard
        license={tampered}
        deviceId="DUMOS-TEST-1"
        clockNotice={null}
        isSuspended={false}
        onRecheck={() => {}}
      />,
    );

  it("offers an admin entry on the blocked card", () => {
    renderCard();

    expect(screen.getByRole("button", { name: /admin access/i })).toBeTruthy();
  });

  it("reveals the email and code fields on demand, not by default", () => {
    renderCard();

    expect(screen.queryByLabelText(/admin email/i)).toBeNull();

    fireEvent.click(screen.getByRole("button", { name: /admin access/i }));

    expect(screen.getByLabelText(/admin email/i)).toBeTruthy();
    expect(screen.getByLabelText(/till access code/i)).toBeTruthy();
  });

  it("does not show the override until a session is live", () => {
    renderCard();

    expect(screen.queryByRole("button", { name: /clear clock lock/i })).toBeNull();
  });

  it("shows the override to a live inspection session and runs it", async () => {
    startTillInspectionSession(live());
    renderCard();

    const button = screen.getByRole("button", { name: /clear clock lock/i });
    fireEvent.click(button);

    await waitFor(() => expect(overrides.calls).toBe(1));
  });

  it("keeps the ordinary recheck and renewal routes available", () => {
    renderCard();

    expect(screen.getByRole("button", { name: /check again/i })).toBeTruthy();
    expect(screen.getByRole("button", { name: /renew subscription/i })).toBeTruthy();
  });

  it("still names the device so support can identify it", () => {
    renderCard();

    expect(screen.getByText(/DUMOS-TEST-1/)).toBeTruthy();
  });

  it("mounts the session banner so the card path has an exit and an idle timer", async () => {
    // Without this the blocked-card entry point reported no exit at all: no
    // End Session, no idle timer, no pagehide beacon.
    startTillInspectionSession(live());
    renderCard();

    expect(await screen.findByRole("button", { name: /end session/i })).toBeTruthy();
  });

  it("shows no banner when no session is live", () => {
    renderCard();

    expect(screen.queryByRole("button", { name: /end session/i })).toBeNull();
  });
});
