import { describe, it, expect, vi, afterEach, beforeEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";

/**
 * The lock screen rendered its title through three independent `&&`
 * expressions rather than one mutually exclusive chain. The third read
 * `!(!clockTampered && isSuspended)`, which negates only the SECOND branch,
 * so with isClockTampered = true it evaluated to `!(false && …)` → true and
 * rendered alongside the first — producing the literal string
 * "Clock DiscrepancySubscription Expired" on a store owner's till.
 *
 * Reported from production after a laptop's system clock ran ~12 hours fast.
 * See docs/KNOWN_BUGS.md.
 */
const licenseState = {
  current: {
    isValid: false,
    tier: "free" as const,
    expiryDate: null as string | null,
    isClockTampered: false,
    isSuspended: false,
    message: "",
  },
};

vi.mock("next/navigation", () => ({
  usePathname: () => "/dashboard",
}));
vi.mock("@/lib/context/store-context", () => ({
  useStore: () => ({ storeProfile: null, isSwitchingStore: false, updateStoreProfile: vi.fn() }),
}));
vi.mock("@/lib/context/auth-context", () => ({
  useAuth: () => ({ isAuthenticated: true }),
}));
vi.mock("@/components/theme-provider", () => ({
  useTheme: () => ({ theme: "light", setTheme: vi.fn() }),
}));
vi.mock("@/lib/hooks/use-feature-gate", () => ({
  useFeatureGate: () => ({ currentTier: "free", canUseMobileApp: true }),
}));
vi.mock("@/lib/hooks/use-auto-lock", () => ({
  useAutoLockStore: (selector: (s: { isLocked: boolean }) => unknown) =>
    selector({ isLocked: false }),
}));
vi.mock("@/lib/utils/device-id", () => ({
  getDeviceId: () => "DUMOS-TEST-0001",
}));
vi.mock("@/lib/licensing/licensing-manager", () => ({
  checkLicenseStatus: vi.fn(async () => licenseState.current),
}));

async function renderGuard() {
  const { LicenseGuard } = await import("@/components/auth/license-guard");
  return render(
    <LicenseGuard>
      <div>app content</div>
    </LicenseGuard>,
  );
}

beforeEach(() => {
  licenseState.current = {
    isValid: false,
    tier: "free",
    expiryDate: null,
    isClockTampered: false,
    isSuspended: false,
    message: "",
  };
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe("LicenseGuard lock screen title", () => {
  it("shows only Clock Discrepancy when the clock watermark is ahead", async () => {
    licenseState.current = {
      ...licenseState.current,
      isClockTampered: true,
      message: "System clock discrepancy detected.",
    };

    await renderGuard();

    await waitFor(() => {
      expect(screen.getByText("Clock Discrepancy")).not.toBeNull();
    });
    expect(screen.queryByText(/Subscription Expired/)).toBeNull();
    expect(screen.queryByText(/Account Suspended/)).toBeNull();
    expect(screen.queryByText(/Clock DiscrepancySubscription Expired/)).toBeNull();
  });

  it("shows only Account Suspended when the store is suspended", async () => {
    licenseState.current = {
      ...licenseState.current,
      isSuspended: true,
      message: "Your store account has been suspended.",
    };

    await renderGuard();

    await waitFor(() => {
      expect(screen.getByText("Account Suspended")).not.toBeNull();
    });
    expect(screen.queryByText(/Clock Discrepancy/)).toBeNull();
    expect(screen.queryByText(/Subscription Expired/)).toBeNull();
  });

  it("lets an ordinary expired subscription through to the app instead of locking it", async () => {
    licenseState.current = {
      ...licenseState.current,
      isValid: false,
      isClockTampered: false,
      isSuspended: false,
    };

    await renderGuard();

    await waitFor(() => {
      expect(screen.getByText("app content")).not.toBeNull();
    });
    expect(screen.queryByText(/Clock Discrepancy/)).toBeNull();
  });
});
