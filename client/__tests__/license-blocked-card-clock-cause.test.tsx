import { describe, it, expect, vi, afterEach } from "vitest";
import { render, screen, cleanup } from "@testing-library/react";
import { LicenseBlockedCard } from "@/components/auth/license-blocked-card";

vi.mock("@/lib/licensing/licensing-manager", () => ({
  overrideClockLockout: vi.fn(() => Promise.resolve({ ok: true, reason: "done" })),
}));

vi.mock("sonner", () => ({ toast: { success: vi.fn(), error: vi.fn() } }));

vi.mock("@/lib/context/store-context", () => ({
  useStore: () => ({ storeProfile: { id: "s1", name: "Nest Amawbia" } }),
}));

vi.mock("@/lib/api/admin-till-session", () => ({
  endAdminTillSession: vi.fn(() => Promise.resolve()),
  beaconAdminTillSessionEnd: vi.fn(),
  readInspectionServerClock: vi.fn(() => Promise.resolve(new Date())),
  requestAdminTillSession: vi.fn(() => Promise.resolve(null)),
  TILL_CODE_LENGTH: 12,
  UNIFORM_REJECTION: "Wrong password.",
  OFFLINE_MESSAGE: "Admin access needs an internet connection.",
}));

// A-266: a customer desktop keeps losing its date, which locks the till on every power cut until the clock is corrected an…
// Rationale: docs/CLIENT_COMMENTS.md#block-__tests__-license-blocked-card-clock-cause-test-tsx-L25
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
