import { describe, it, expect, vi, afterEach } from "vitest";
import { render, screen, cleanup } from "@testing-library/react";
import { LicenseBlockedCard } from "@/components/auth/license-blocked-card";

vi.mock("@/lib/licensing/licensing-manager", () => ({
  overrideClockLockout: vi.fn(async () => ({ ok: true, reason: "done" })),
}));

vi.mock("sonner", () => ({ toast: { success: vi.fn(), error: vi.fn() } }));

vi.mock("@/lib/context/store-context", () => ({
  useStore: () => ({ storeProfile: { id: "s1", name: "Nest Amawbia" } }),
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

/**
 * A-266: a customer desktop keeps losing its date, which locks the till on
 * every power cut until the clock is corrected and verified online. The lock
 * is right, but a screen that only says "Clock Discrepancy" gets blamed on the
 * software; one that names the coin cell gets the ₦500 part replaced once.
 */
const clockTampered = {
  isValid: false,
  isClockTampered: true,
  isSuspended: false,
  message: "System clock discrepancy detected.",
} as never;

const expired = {
  isValid: false,
  isClockTampered: false,
  isSuspended: false,
  message: "Subscription expired.",
} as never;

describe("LicenseBlockedCard: naming the cause of a clock lock", () => {
  afterEach(cleanup);

  const renderCard = (license: never, isSuspended = false) =>
    render(
      <LicenseBlockedCard
        license={license}
        deviceId="DRX-TEST-1"
        clockNotice={null}
        isSuspended={isSuspended}
        onRecheck={() => {}}
      />,
    );

  it("explains the battery and the two steps out, on a clock lock", () => {
    renderCard(clockTampered);

    expect(screen.getByText(/CR2032/)).toBeTruthy();
    expect(screen.getByText(/motherboard battery/)).toBeTruthy();
    expect(screen.getByText(/set the correct date and time/i)).toBeTruthy();
  });

  it("does not blame a battery when the subscription has simply expired", () => {
    renderCard(expired);

    expect(screen.queryByText(/CR2032/)).toBeNull();
  });
});
